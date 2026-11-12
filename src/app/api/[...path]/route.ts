import { fail, isBusy } from "@/lib/http";
import { flush, hydrate } from "@/lib/store";
import * as caseGet from "@/server/api/cases/[id]/route";
import * as caseApprove from "@/server/api/cases/[id]/approve/route";
import * as caseDismiss from "@/server/api/cases/[id]/dismiss/route";
import * as caseRun from "@/server/api/cases/[id]/run/route";
import * as demo from "@/server/api/demo/route";
import * as extract from "@/server/api/extract/route";
import * as invoices from "@/server/api/invoices/route";
import * as settings from "@/server/api/settings/route";
import * as state from "@/server/api/state/route";
import * as syncRoute from "@/server/api/sync/route";

// Every API call goes through this one function. On Vercel several serverless instances can
// answer requests, so with a shared store configured (see lib/store.ts) each request first
// loads the latest state and writes its changes back before it returns.

export const maxDuration = 300;

type Ctx = { params: Promise<{ path: string[] }> };
type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

function route(method: string, path: string[]): { handler?: Handler; id?: string } {
  const [a, b, c] = path;
  const pick = (m: Record<string, unknown>) => m[method] as Handler | undefined;
  if (a === "cases" && b && !c) return { handler: pick(caseGet), id: b };
  if (a === "cases" && b && c === "approve") return { handler: pick(caseApprove), id: b };
  if (a === "cases" && b && c === "dismiss") return { handler: pick(caseDismiss), id: b };
  if (a === "cases" && b && c === "run") return { handler: pick(caseRun), id: b };
  if (path.length === 1) {
    const table: Record<string, Record<string, unknown>> = { demo, extract, invoices, settings, state, sync: syncRoute };
    const mod = table[a];
    if (mod) return { handler: pick(mod) };
  }
  return {};
}

async function handle(method: string, req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  const { handler, id } = route(method, path);
  if (!handler) return fail(new Error(`No route for ${method} /api/${path.join("/")}`), 404);
  // While an agent run is still going on this instance, its memory is the newest copy.
  if (!isBusy()) await hydrate();
  const res = await handler(req, { params: Promise.resolve({ id: id ?? "" }) });
  await flush();
  return res;
}

export function GET(req: Request, ctx: Ctx) {
  return handle("GET", req, ctx);
}

export function POST(req: Request, ctx: Ctx) {
  return handle("POST", req, ctx);
}
