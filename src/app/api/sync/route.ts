import { sync } from "@/lib/cases";
import { fail, ok } from "@/lib/http";

export async function POST() {
  try {
    return ok(await sync());
  } catch (e) {
    return fail(e, 502);
  }
}
