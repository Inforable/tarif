import { background, startRun } from "@/lib/cases";
import { fail, keepAlive, ok, type IdParams } from "@/lib/http";

export const maxDuration = 300;

// Starts the agent and returns immediately; the case page polls the trace while it runs.
export async function POST(_req: Request, { params }: IdParams) {
  const { id } = await params;
  try {
    background(startRun(id));
    keepAlive();
    return ok({ started: true });
  } catch (e) {
    return fail(e);
  }
}
