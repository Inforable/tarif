import { after, NextResponse } from "next/server";
import { takeBackground } from "./cases";
import { flush } from "./store";

const g = globalThis as unknown as { __tagihBusy?: number };

/** True while this instance is still finishing background work (agent runs) after a response. */
export function isBusy() {
  return (g.__tagihBusy ?? 0) > 0;
}

/** Keep the function alive for agent runs started during this request. */
export function keepAlive() {
  g.__tagihBusy = (g.__tagihBusy ?? 0) + 1;
  after(async () => {
    try {
      let batch = takeBackground();
      while (batch.length) {
        await Promise.all(batch);
        batch = takeBackground();
      }
      // Make sure everything the run wrote reaches the shared store before the instance sleeps.
      await flush();
    } finally {
      g.__tagihBusy = Math.max(0, (g.__tagihBusy ?? 1) - 1);
    }
  });
}

export function ok(data: unknown = { ok: true }) {
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

export function fail(e: unknown, status = 400) {
  const message = e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: message }, { status });
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export type IdParams = { params: Promise<{ id: string }> };
