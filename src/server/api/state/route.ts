import { ok } from "@/lib/http";
import { overviewView } from "@/lib/views";

export async function GET() {
  return ok(overviewView());
}
