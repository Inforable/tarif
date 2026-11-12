import fs from "node:fs";
import path from "node:path";
import type { StoreShape } from "./types";
import { seedStore } from "./seed";

// A small JSON-file store. Good enough for a single-instance demo (Render web service).
// Writes are synchronous so a background agent run and a request never interleave mid-write.

// Vercel and other serverless hosts only allow writes under /tmp.
const DATA_DIR = process.env.TAGIH_DATA_DIR || (process.env.VERCEL ? "/tmp/tagih" : path.join(process.cwd(), ".data"));
const FILE = path.join(DATA_DIR, "store.json");
const VERSION = 3;

const g = globalThis as unknown as { __tagihStore?: StoreShape };

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

function persist(s: StoreShape) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(s, null, 1));
}

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
