import { after, NextResponse } from "next/server";
import { takeBackground } from "./cases";

/** Keep the function alive for agent runs started during this request. */
export function keepAlive() {
  after(async () => {
    let batch = takeBackground();
    while (batch.length) {
      await Promise.all(batch);
      batch = takeBackground();
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
