import { approve } from "@/lib/cases";
import { body, fail, ok, type IdParams } from "@/lib/http";

export async function POST(req: Request, { params }: IdParams) {
  const { id } = await params;
  const b = await body<{ option: number; subject?: string; message?: string }>(req);
  try {
    await approve(id, Number(b.option), { subject: b.subject, message: b.message });
    return ok();
  } catch (e) {
    return fail(e, 409);
  }
}
