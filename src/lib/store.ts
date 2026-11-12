import fs from "node:fs";
import path from "node:path";
import type { StoreShape } from "./types";
import { seedStore } from "./seed";

// The app state lives in one JSON document.
//
// Locally and on Render (one long-running instance) it is a JSON file, as before.
// On Vercel every serverless instance has its own memory and its own /tmp, so a file there is
// not shared: a write on one instance is invisible to the next request if another instance
// answers it. When a Redis REST endpoint is configured (Upstash or Vercel KV), the document is
// also kept in Redis: every request loads the latest copy before it runs (hydrate) and every
// change is written back before the response or background run ends (flush).
//
// The rest of the code keeps using the synchronous db() / mutate() / save() API.

// Vercel and other serverless hosts only allow writes under /tmp.
const DATA_DIR = process.env.TAGIH_DATA_DIR || (process.env.VERCEL ? "/tmp/tagih" : path.join(process.cwd(), ".data"));
const FILE = path.join(DATA_DIR, "store.json");
const VERSION = 3;

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
const REDIS_KEY = process.env.TAGIH_REDIS_KEY || "tagih:store";

const g = globalThis as unknown as {
  __tagihStore?: StoreShape;
  __tagihWrite?: { chain: Promise<void>; dirty: boolean };
};

export function sharedStore() {
  return !!(REDIS_URL && REDIS_TOKEN);
}

/* ---------------- local file ---------------- */

function load(): StoreShape {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8")) as StoreShape;
    if (raw.version === VERSION) return raw;
  } catch {
    // first start or corrupt file: fall through to seed
  }
  const fresh = seedStore(VERSION);
  persist(fresh);
  return fresh;
}

function writeFile(s: StoreShape) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(s, null, 1));
  } catch (e) {
    // With a shared store the file is only a local cache, so a failed write is not fatal.
    if (!sharedStore()) throw e;
  }
}

function persist(s: StoreShape) {
  writeFile(s);
  if (sharedStore()) scheduleRemoteWrite();
}

/* ---------------- shared store (Redis REST) ---------------- */

async function redis(command: unknown[]): Promise<unknown> {
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const out = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string };
  if (!res.ok || out.error) throw new Error(`Redis ${String(command[0])} failed: ${out.error ?? res.status}`);
  return out.result;
}

function writer() {
  if (!g.__tagihWrite) g.__tagihWrite = { chain: Promise.resolve(), dirty: false };
  return g.__tagihWrite;
}

// Writes are queued in order and coalesced: each queued write sends the latest snapshot,
// so a burst of save() calls during an agent run costs one or two Redis writes.
function scheduleRemoteWrite() {
  const w = writer();
  w.dirty = true;
  w.chain = w.chain
    .then(async () => {
      if (!w.dirty || !g.__tagihStore) return;
      w.dirty = false;
      await redis(["SET", REDIS_KEY, JSON.stringify(g.__tagihStore)]);
    })
    .catch((e) => {
      w.dirty = true; // retry on the next flush
      console.error("[tagih] shared store write failed", e);
    });
}

/** Waits until every change made so far is in the shared store. No-op without Redis. */
export async function flush() {
  if (!sharedStore()) return;
  const w = writer();
  await w.chain;
  if (w.dirty) {
    scheduleRemoteWrite();
    await w.chain;
  }
}

/**
 * Loads the latest state from the shared store into this instance. Call at the start of a
 * request, but not while this instance is running background work (its memory is then the
 * newest copy, and replacing it would orphan the objects the run is changing).
 */
export async function hydrate() {
  if (!sharedStore()) return;
  await flush();
  try {
    const raw = (await redis(["GET", REDIS_KEY])) as string | null;
    if (raw) {
      const parsed = JSON.parse(raw) as StoreShape;
      if (parsed.version === VERSION) {
        g.__tagihStore = parsed;
        writeFile(parsed);
        return;
      }
    }
    // Nothing shared yet (first deploy or a version bump): publish this instance's copy.
    g.__tagihStore = db();
    scheduleRemoteWrite();
    await flush();
  } catch (e) {
    // Redis unreachable: keep serving this instance's copy rather than failing the request.
    console.error("[tagih] shared store read failed", e);
    db();
  }
}

/* ---------------- API used by the app ---------------- */

export function db(): StoreShape {
  if (!g.__tagihStore) g.__tagihStore = load();
  return g.__tagihStore;
}

export function save() {
  persist(db());
}

export function mutate<T>(fn: (s: StoreShape) => T): T {
  const s = db();
  const out = fn(s);
  persist(s);
  return out;
}

export function resetStore() {
  g.__tagihStore = seedStore(VERSION);
  persist(g.__tagihStore);
}

export function nextId(prefix: string) {
  return mutate((s) => {
    s.seq += 1;
    return `${prefix}-${String(s.seq).padStart(4, "0")}`;
  });
}
