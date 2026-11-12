import { extractDraft } from "@/lib/agent/extract";
import { body, fail, ok } from "@/lib/http";

export async function POST(req: Request) {
  const b = await body<{ text?: string }>(req);
  if (!b.text?.trim()) return fail(new Error("Paste a conversation or describe the work first"));
  try {
    return ok(await extractDraft(b.text));
  } catch (e) {
    return fail(e, 502);
  }
}
