import { currentModel, hasModel } from "@/lib/agent/agent";
import { body, fail, ok } from "@/lib/http";
import { db, mutate } from "@/lib/store";
import { isKnownModel } from "@/lib/models";
import type { Settings } from "@/lib/types";

export async function POST(req: Request) {
  const b = await body<Partial<Settings>>(req);
  try {
    mutate((s) => {
      if (b.autonomy === "always_ask" || b.autonomy === "policy_based") s.settings.autonomy = b.autonomy;
      if (Number(b.approvalThreshold) > 0) s.settings.approvalThreshold = Number(b.approvalThreshold);
      if (Number(b.maxDiscountPct) >= 2 && Number(b.maxDiscountPct) <= 30) s.settings.maxDiscountPct = Number(b.maxDiscountPct);
      if (typeof b.model === "string" && isKnownModel(b.model)) s.settings.model = b.model;
      if (Number(b.paymentWindowDays) >= 1) s.settings.paymentWindowDays = Number(b.paymentWindowDays);
    });
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function GET() {
  return ok({ ...db().settings, model: currentModel(), hasKey: hasModel() });
}
