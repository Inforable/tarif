import { startRun } from "@/lib/cases";
import { fail, ok, type IdParams } from "@/lib/http";

// Starts the agent and returns immediately; the case page polls the trace while it runs.
export async function POST(_req: Request, { params }: IdParams) {
  const { id } = await params;
  try {
    void startRun(id);
    return ok({ started: true });
  } catch (e) {
    return fail(e);
  }
}
