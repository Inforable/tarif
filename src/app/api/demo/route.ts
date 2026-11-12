import { advanceClock, createDemoInvoices, reset, runScenario, simulatePayment, sync } from "@/lib/cases";
import { body, fail, ok } from "@/lib/http";

// Demo controls. Disabled when TAGIH_DEMO_CONTROLS=off.
export async function POST(req: Request) {
  if (process.env.TAGIH_DEMO_CONTROLS === "off") return fail(new Error("Demo controls are off"), 403);
  const b = await body<{ action: string; days?: number; invoiceId?: string; client?: string; autopilot?: boolean }>(req);
  try {
    switch (b.action) {
      case "invoices":
        await createDemoInvoices();
        return ok(await sync());
      case "advance":
        return ok(await advanceClock(Math.max(1, Math.min(30, Number(b.days) || 1))));
      case "pay":
        return ok(await simulatePayment(String(b.invoiceId)));
      case "scenario":
        return ok({ caseId: await runScenario(String(b.client), b.autopilot !== false) });
      case "reset":
        reset();
        return ok();
      default:
        return fail(new Error(`Unknown action ${b.action}`));
    }
  } catch (e) {
    return fail(e, 502);
  }
}
