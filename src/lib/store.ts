import fs from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import type { CollectionCase, StoreShape } from "./types";
import { seedStore } from "./seed";

/*
  Storage, one module for every backend.

  - Upstash Redis when UPSTASH_REDIS_REST_URL/TOKEN (or Vercel's KV_REST_API_URL/TOKEN) are set.
    Shared by every serverless instance. Each entity is its own hash field, so a write only touches
    what changed. Cases carry a `rev` and are written through a compare-and-set script, and the
    flows that change a case hold a per-case lock (see lock()).
  - A JSON file otherwise (local dev, e2e, single-server hosting). No keys needed.

  The app works on an in-memory copy (db()). With Redis:
    hydrate()  loads the shared state at the start of each request (in place, so references stay valid)
    save()     queues a flush of only the entities that changed
    settle()   waits for queued flushes; the API route awaits it before responding
*/

const VERSION = 3;
const DATA_DIR = process.env.TAGIH_DATA_DIR || (process.env.VERCEL ? "/tmp/tagih" : path.join(process.cwd(), ".data"));
const FILE = path.join(DATA_DIR, "store.json");

const K = {
  epoch: "tagih:epoch",
  clock: "tagih:clock",
  settings: "tagih:settings",
  playbook: "tagih:playbook",
  inv: "tagih:inv",
  case: "tagih:case",
  sim: "tagih:sim",
  seq: (name: string) => `tagih:seq:${name}`,
  lock: (name: string) => `tagih:lock:${name}`,
};
const HASH: Record<string, string> = { pb: K.playbook, inv: K.inv, case: K.case, sim: K.sim };

interface State {
  data: StoreShape | null;
  snap: Map<string, string>; // entity key -> JSON last seen in / written to Redis
  epoch: string;
  chain: Promise<void>;
  locks: Map<string, number>; // lock name -> local hold count
  owner: string;
  keepLocal: (caseId: string) => boolean;
  onEpochChange: () => void;
}

const g = globalThis as unknown as { __tagih?: State };
function st(): State {
  if (!g.__tagih) {
    g.__tagih = {
      data: null,
      snap: new Map(),
      epoch: "",
      chain: Promise.resolve(),
      locks: new Map(),
      owner: Math.random().toString(36).slice(2),
      keepLocal: () => false,
      onEpochChange: () => {},
    };
  }
  return g.__tagih;
}

let client: Redis | null | undefined;
export function redis(): Redis | null {
  if (client === undefined) {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    client = url && token ? new Redis({ url, token, automaticDeserialization: false }) : null;
  }
  return client;
}

export function storeBackend(): "redis" | "file" {
  return redis() ? "redis" : "file";
}

/** Cases whose in-memory copy must win over Redis during hydrate (an agent is running on them here). */
export function setLocalOwnership(keepLocal: (caseId: string) => boolean, onEpochChange: () => void) {
  st().keepLocal = keepLocal;
  st().onEpochChange = onEpochChange;
}

/* ---------------- file backend ---------------- */

function fileLoad(): StoreShape {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8")) as StoreShape;
    if (raw.version === VERSION) return raw;
  } catch {
    // first start or corrupt file: fall through to seed
  }
  const fresh = seedStore(VERSION);
  fileWrite(fresh);
  return fresh;
}

function fileWrite(s: StoreShape) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(s, null, 1));
}

/* ---------------- public API ---------------- */

export function db(): StoreShape {
  const s = st();
  if (!s.data) {
    if (redis()) throw new Error("Store not loaded: call await hydrate() at the start of the request");
    s.data = fileLoad();
  }
  return s.data;
}

export function save() {
  if (!redis()) {
    fileWrite(db());
    return;
  }
  const s = st();
  s.chain = s.chain.then(flush).catch((e) => console.error("[store] flush failed", e));
}

export function mutate<T>(fn: (s: StoreShape) => T): T {
  const out = fn(db());
  save();
  return out;
}

/** Wait until every queued write has reached the shared store. */
export function settle(): Promise<void> {
  return st().chain;
}

export async function resetStore() {
  const fresh = seedStore(VERSION);
  if (!redis()) {
    st().data = fresh;
    fileWrite(fresh);
    return;
  }
  await settle();
  await writeFresh(fresh);
}

export async function nextSeq(name: string): Promise<number> {
  const r = redis();
  if (r) return r.incr(K.seq(name));
  const d = db();
  d.seq += 1;
  save();
  return d.seq;
}

export async function nextId(prefix: string) {
  return `${prefix}-${String(await nextSeq(prefix)).padStart(4, "0")}`;
}

/**
 * Re-entrant lock shared by all instances. Returns false if another instance holds it.
 * With the file backend there is one process, so it always succeeds.
 */
export async function lock(name: string, ms: number): Promise<boolean> {
  const s = st();
  const held = s.locks.get(name) ?? 0;
  if (held > 0) {
    s.locks.set(name, held + 1);
    return true;
  }
  const r = redis();
  if (r) {
    const ok = await r.set(K.lock(name), s.owner, { nx: true, px: ms });
    if (!ok) return false;
  }
  s.locks.set(name, 1);
  return true;
}

export async function unlock(name: string) {
  const s = st();
  const held = s.locks.get(name) ?? 0;
  if (held > 1) {
    s.locks.set(name, held - 1);
    return;
  }
  s.locks.delete(name);
  const r = redis();
  if (r) {
    // only delete our own lock
    await r.eval(`if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`, [K.lock(name)], [s.owner]);
  }
}

/* ---------------- Redis backend ---------------- */

function entities(d: StoreShape): Map<string, string> {
  const m = new Map<string, string>();
  m.set("clock", JSON.stringify(d.clockOffsetDays));
  m.set("settings", JSON.stringify(d.settings));
  for (const p of d.playbook) m.set(`pb:${p.action}|${p.segment}`, JSON.stringify(p));
  for (const i of d.invoices) m.set(`inv:${i.id}`, JSON.stringify(i));
  for (const c of d.cases) m.set(`case:${c.id}`, JSON.stringify(c));
  for (const [id, v] of Object.entries(d.sim)) m.set(`sim:${id}`, JSON.stringify(v));
  return m;
}

function split(key: string): [string, string] {
  const i = key.indexOf(":");
  return i < 0 ? [key, ""] : [key.slice(0, i), key.slice(i + 1)];
}

async function writeFresh(data: StoreShape) {
  const r = redis()!;
  const s = st();
  const epoch = Math.random().toString(36).slice(2);
  await r.del(K.clock, K.settings, K.playbook, K.inv, K.case, K.sim, K.seq("CASE"), K.seq("TG"));
  const ents = entities(data);
  const p = r.pipeline();
  for (const [key, json] of ents) {
    const [kind, id] = split(key);
    if (kind === "clock") p.set(K.clock, json);
    else if (kind === "settings") p.set(K.settings, json);
    else p.hset(HASH[kind], { [id]: json });
  }
  p.set(K.epoch, epoch);
  await p.exec();
  s.data = data;
  s.snap = ents;
  s.epoch = epoch;
  s.onEpochChange();
}

const CAS = `
local cur = redis.call('HGET', KEYS[1], ARGV[1])
local expected = tonumber(ARGV[2])
if cur then
  local ok, obj = pcall(cjson.decode, cur)
  local rev = 0
  if ok and obj['rev'] then rev = tonumber(obj['rev']) end
  if rev ~= expected then return 0 end
elseif expected >= 0 then
  return 0
end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
return 1`;

async function flush() {
  const r = redis();
  const s = st();
  if (!r || !s.data) return;
  const d = s.data;

  // Bump rev on every case that changed, so the compare-and-set below can detect concurrent writers.
  const casePrev = new Map<string, number>();
  for (const c of d.cases) {
    const key = `case:${c.id}`;
    const before = s.snap.get(key);
    if (before === JSON.stringify(c)) continue;
    const prevRev = before ? ((JSON.parse(before) as CollectionCase).rev ?? 0) : -1;
    casePrev.set(c.id, prevRev);
    c.rev = prevRev + 1;
  }

  const now = entities(d);
  const changed = [...now].filter(([k, v]) => s.snap.get(k) !== v);
  const removed = [...s.snap.keys()].filter((k) => !now.has(k));
  if (!changed.length && !removed.length) return;

  // A reset elsewhere invalidates everything we hold; drop it instead of writing old data back.
  const remoteEpoch = await r.get<string>(K.epoch);
  if (remoteEpoch !== s.epoch) {
    s.data = null;
    s.snap = new Map();
    return;
  }

  const p = r.pipeline();
  let n = 0;
  for (const [key, json] of changed) {
    const [kind, id] = split(key);
    if (kind === "case") continue;
    if (kind === "clock") p.set(K.clock, json);
    else if (kind === "settings") p.set(K.settings, json);
    else p.hset(HASH[kind], { [id]: json });
    n++;
  }
  for (const key of removed) {
    const [kind, id] = split(key);
    if (HASH[kind]) {
      p.hdel(HASH[kind], id);
      n++;
    }
  }
  if (n) await p.exec();
  for (const [key, json] of changed) if (!key.startsWith("case:")) s.snap.set(key, json);
  for (const key of removed) s.snap.delete(key);

  for (const [key, json] of changed) {
    if (!key.startsWith("case:")) continue;
    const id = key.slice(5);
    const ok = await r.eval(CAS, [K.case], [id, String(casePrev.get(id) ?? -1), json]);
    if (Number(ok) === 1) {
      s.snap.set(key, json);
    } else {
      // Someone else wrote this case in between: their version wins, ours is dropped and reported.
      console.warn(`[store] write conflict on case ${id}; reloading the shared version`);
      const remote = await r.hget<string>(K.case, id);
      const local = d.cases.find((c) => c.id === id);
      if (remote && local) {
        replaceInPlace(local, JSON.parse(remote));
        s.snap.set(key, remote);
      }
    }
  }
}

function replaceInPlace<T extends object>(target: T, source: T) {
  for (const k of Object.keys(target)) delete (target as Record<string, unknown>)[k];
  Object.assign(target, source);
}

/** HGETALL without automatic deserialization comes back as a flat [field, value, ...] array. */
function parseHash<T>(h: Record<string, unknown> | unknown[] | null): Array<[string, string, T]> {
  const pairs: Array<[string, unknown]> = [];
  if (Array.isArray(h)) for (let i = 0; i + 1 < h.length; i += 2) pairs.push([String(h[i]), h[i + 1]]);
  else for (const [k, v] of Object.entries(h ?? {})) pairs.push([k, v]);
  return pairs.map(([id, v]) => {
    const raw = typeof v === "string" ? v : JSON.stringify(v);
    return [id, raw, JSON.parse(raw) as T];
  });
}

/** Load the shared state. Objects that already exist locally are updated in place. */
export async function hydrate() {
  const r = redis();
  if (!r) {
    db();
    return;
  }
  const s = st();
  await s.chain;

  let epoch = await r.get<string>(K.epoch);
  if (!epoch) {
    await writeFresh(seedStore(VERSION));
    return;
  }
  const [clock, settings, pb, inv, cases, sim] = await Promise.all([
    r.get<string>(K.clock),
    r.get<string>(K.settings),
    r.hgetall(K.playbook),
    r.hgetall(K.inv),
    r.hgetall(K.case),
    r.hgetall(K.sim),
  ]);
  epoch = String(epoch);

  const fresh = !s.data || s.epoch !== epoch;
  if (fresh && s.data && s.epoch !== epoch) s.onEpochChange();
  const base: StoreShape = fresh ? seedStore(VERSION) : s.data!;
  const snap = new Map<string, string>();

  base.clockOffsetDays = clock ? Number(JSON.parse(String(clock))) : 0;
  snap.set("clock", JSON.stringify(base.clockOffsetDays));
  if (settings) {
    replaceInPlace(base.settings, JSON.parse(String(settings)));
    snap.set("settings", String(settings));
  }

  const pbRows = parseHash<StoreShape["playbook"][number]>(pb);
  base.playbook = pbRows.map(([, , v]) => v);
  for (const [id, raw] of pbRows) snap.set(`pb:${id}`, raw);

  const invRows = parseHash<StoreShape["invoices"][number]>(inv);
  const invById = new Map((fresh ? [] : base.invoices).map((i) => [i.id, i]));
  base.invoices = invRows.map(([id, raw, v]) => {
    snap.set(`inv:${id}`, raw);
    const local = invById.get(id);
    if (local) {
      replaceInPlace(local, v);
      return local;
    }
    return v;
  });

  const caseRows = parseHash<CollectionCase>(cases);
  const caseById = new Map((fresh ? [] : base.cases).map((c) => [c.id, c]));
  const merged: CollectionCase[] = [];
  for (const [id, raw, v] of caseRows) {
    snap.set(`case:${id}`, raw);
    const local = caseById.get(id);
    if (local && s.keepLocal(id)) merged.push(local);
    else if (local) {
      replaceInPlace(local, v);
      merged.push(local);
    } else merged.push(v);
  }
  if (!fresh) for (const c of base.cases) if (s.keepLocal(c.id) && !merged.includes(c)) merged.push(c);
  base.cases = merged.sort((a, b) => (a.openedAt < b.openedAt ? 1 : a.openedAt > b.openedAt ? -1 : b.id.localeCompare(a.id)));

  base.sim = {};
  for (const [id, raw, v] of parseHash<StoreShape["sim"][string]>(sim)) {
    base.sim[id] = v;
    snap.set(`sim:${id}`, raw);
  }

  s.data = base;
  s.snap = snap;
  s.epoch = epoch;
}
