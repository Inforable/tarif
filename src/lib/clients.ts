import { daysBetween } from "./clock";
import type { ActionType, Invoice, PlaybookStat, StoreShape } from "./types";

export type Segment = "reliable" | "slow_payer" | "habitual_late" | "new";

export interface ClientProfile {
  client: string;
  invoices: number;
  paid: number;
  avgDaysLate: number | null;
  maxDaysLate: number | null;
  avgReminders: number | null;
  segment: Segment;
  segmentRule: string;
}

/** Deterministic segmentation from paid history. The agent reads this; it does not invent it. */
export function profileFor(s: StoreShape, client: string, excludeId?: string): ClientProfile {
  const all = s.invoices.filter((i) => i.clientName === client && i.id !== excludeId);
  const paid = all.filter((i) => i.paidAt);
  const lates = paid.map((i) => Math.max(0, daysBetween(i.dueDate, i.paidAt!)));
  const avg = lates.length ? lates.reduce((a, b) => a + b, 0) / lates.length : null;
  const max = lates.length ? Math.max(...lates) : null;
  const rem = paid.length ? paid.reduce((a, i) => a + i.remindersSent, 0) / paid.length : null;
  let segment: Segment = "new";
  let segmentRule = "no paid invoices on record";
  if (avg !== null && max !== null) {
    const spread = max - Math.min(...lates);
    if (avg <= 4) {
      segment = "reliable";
      segmentRule = `average ${avg.toFixed(1)} days late (at most 4)`;
    } else if (spread <= 6 && avg >= 8) {
      segment = "habitual_late";
      segmentRule = `consistently ${Math.min(...lates)} to ${max} days late (spread at most 6)`;
    } else {
      segment = "slow_payer";
      segmentRule = `average ${avg.toFixed(1)} days late with spread ${spread}`;
    }
  }
  return {
    client,
    invoices: all.length,
    paid: paid.length,
    avgDaysLate: avg === null ? null : Number(avg.toFixed(1)),
    maxDaysLate: max,
    avgReminders: rem === null ? null : Number(rem.toFixed(1)),
    segment,
    segmentRule,
  };
}

export function payRate(p: Pick<PlaybookStat, "tries" | "paid">): number {
  return Number(((p.paid + 1) / (p.tries + 2)).toFixed(2)); // Laplace prior
}

export function playbookFor(s: StoreShape, segment: string) {
  const actions: ActionType[] = ["friendly_nudge", "firm_reminder", "early_pay_discount", "split_payment", "personal_call"];
  return actions.map((action) => {
    const st = s.playbook.find((p) => p.action === action && p.segment === segment);
    const tries = st?.tries ?? 0;
    const paid = st?.paid ?? 0;
    return {
      action,
      tries,
      paid,
      payRate: payRate({ tries, paid }),
      avgDaysToPay: st && st.paid ? Number((st.totalDaysToPay / st.paid).toFixed(1)) : null,
    };
  });
}

export function outstanding(inv: Invoice) {
  return !["PAID", "MARKED_AS_PAID", "CANCELLED", "REFUNDED", "DRAFT"].includes(inv.status);
}

const INJECTION = /(ignore (all|previous|the above)|system prompt|you are now|disregard|as an ai|give (a )?\d+% discount|set (the )?amount)/i;

/** Text from clients is data. Flag anything that reads like an instruction to the model. */
export function suspicious(text: string): boolean {
  return INJECTION.test(text);
}
