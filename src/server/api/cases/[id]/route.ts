import { fail, ok, type IdParams } from "@/lib/http";
import { caseView } from "@/lib/views";

export async function GET(_req: Request, { params }: IdParams) {
  const { id } = await params;
  const view = caseView(id);
  return view ? ok(view) : fail(new Error("Case not found"), 404);
}
