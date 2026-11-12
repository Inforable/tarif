import { dismiss } from "@/lib/cases";
import { body, fail, ok, type IdParams } from "@/lib/http";

export async function POST(req: Request, { params }: IdParams) {
  const { id } = await params;
  const b = await body<{ reason?: string }>(req);
  try {
    dismiss(id, b.reason ?? "");
    return ok();
  } catch (e) {
    return fail(e);
  }
}
