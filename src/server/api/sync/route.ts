import { sync } from "@/lib/cases";
import { fail, ok, keepAlive } from "@/lib/http";

export const maxDuration = 300;

export async function POST() {
  keepAlive();
  try {
    return ok(await sync());
  } catch (e) {
    return fail(e, 502);
  }
}
