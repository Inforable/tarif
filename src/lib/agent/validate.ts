import { z } from "zod";
import { db } from "../store";
import type { CollectionPlan } from "../types";

const Option = z.object({
  action: z.enum(["friendly_nudge", "firm_reminder", "early_pay_discount", "split_payment", "personal_call"]),
  title: z.string().min(3),
  rationale: z.string().min(3),
  subject: z.string().min(3),
  message: z.string().min(20),
  discountPct: z.number().optional(),
  installments: z.number().int().optional(),
  expectedPayRate: z.number().optional(),
});

export const PlanSchema = z.object({
  likelyReason: z.enum(["forgot", "cash_flow", "unhappy_with_work", "wrong_contact", "habitual_late_payer", "unknown"]),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(10),
  evidence: z.array(z.object({ claim: z.string(), source: z.string(), kind: z.enum(["fact", "assumption", "unknown"]) })).min(1),
  options: z.array(Option).min(1).max(3),
  recommended: z.number().int(),
  considered: z.string().optional(),
});

export interface ToolCallRecord {
  callId: string;
  name: string;
  output: unknown;
}

/**
 * Code checks the agent's plan against what the tools actually returned.
 * Returns a list of problems; empty means the plan may go to policy.
 */
export function validatePlan(raw: unknown, calls: ToolCallRecord[]): { plan?: CollectionPlan; problems: string[] } {
  const parsed = PlanSchema.safeParse(raw);
  if (!parsed.success) {
    return { problems: parsed.error.issues.map((i) => `${i.path.join(".") || "plan"}: ${i.message}`) };
  }
  const plan = parsed.data as CollectionPlan;
  const problems: string[] = [];
  const ids = new Set(calls.map((c) => c.callId));
  const settings = db().settings;

  plan.evidence.forEach((e, i) => {
    if (e.kind === "fact" && !ids.has(e.source)) {
      problems.push(`evidence[${i}] is a fact but cites "${e.source}", which is not a call_id you received (${[...ids].join(", ") || "none"}).`);
    }
  });
  if (!plan.evidence.some((e) => e.kind === "fact")) problems.push("No fact with a source. Read the data before planning.");

  if (plan.recommended < 0 || plan.recommended >= plan.options.length) {
    problems.push(`recommended=${plan.recommended} does not point at an option (0..${plan.options.length - 1}).`);
  }

  const playbookCalls = calls.filter((c) => c.name === "get_playbook");
  plan.options.forEach((o, i) => {
    if (o.action === "early_pay_discount") {
      if (o.discountPct === undefined) problems.push(`options[${i}]: early_pay_discount needs discountPct.`);
      else if (o.discountPct < 2 || o.discountPct > settings.maxDiscountPct)
        problems.push(`options[${i}]: discountPct ${o.discountPct} is outside 2..${settings.maxDiscountPct}.`);
    }
    if (o.action === "split_payment" && (o.installments === undefined || o.installments < 2 || o.installments > 3)) {
      problems.push(`options[${i}]: split_payment needs installments of 2 or 3.`);
    }
    if (o.expectedPayRate !== undefined) {
      const match = playbookCalls.some((c) => {
        const out = c.output as { strategies?: Array<{ action: string; payRate: number }> };
        const row = out.strategies?.find((r) => r.action === o.action);
        return row && Math.abs(row.payRate - o.expectedPayRate!) <= 0.01;
      });
      if (!match) problems.push(`options[${i}]: expectedPayRate ${o.expectedPayRate} for ${o.action} does not match any get_playbook output. Copy it exactly or omit it.`);
    }
  });

  return { plan, problems };
}
