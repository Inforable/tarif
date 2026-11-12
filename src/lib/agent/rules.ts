import type { ActionType, CollectionPlan, LikelyReason, PlanOption } from "../types";
import type { ToolCallRecord } from "./validate";

// Deterministic safety net. Runs when no model is configured or the model's plan keeps failing validation.
// It reads the same tool outputs as the agent; the trace labels every step "rules".

interface Inv { invoiceNumber: string; amount: number; currency: string; daysOverdue: number; client: string; remindersSent: number }
interface Hist { segment: string; avgDaysLate: number | null; paid: number; segmentRule: string }
interface Book { strategies: Array<{ action: ActionType; payRate: number; tries: number }> }
interface Log { earlier: Array<{ action: ActionType | null; outcome: string }> }

export function rulePlan(calls: ToolCallRecord[], maxDiscount: number): CollectionPlan {
  const get = <T,>(name: string) => calls.find((c) => c.name === name) as (ToolCallRecord & { output: T }) | undefined;
  const inv = get<Inv>("get_invoice")!;
  const hist = get<Hist>("get_client_history")!;
  const book = get<Book>("get_playbook")!;
  const log = get<Log>("get_reminder_log");
  const i = inv.output, h = hist.output;
  const failed = new Set((log?.output.earlier ?? []).filter((e) => e.outcome === "not_paid").map((e) => e.action));
  const money = `${i.currency} ${i.amount.toFixed(2)}`;

  const reason: LikelyReason =
    h.segment === "reliable" ? "forgot" : h.segment === "habitual_late" ? "habitual_late_payer" : h.segment === "slow_payer" ? "cash_flow" : "unknown";
  const ranked = [...book.output.strategies].filter((s) => !failed.has(s.action)).sort((a, b) => b.payRate - a.payRate);
  const pick = ranked.slice(0, 3).map((s) => s.action);
  const rate = (a: ActionType) => book.output.strategies.find((s) => s.action === a)?.payRate;

  const make = (action: ActionType): PlanOption => {
    const base = { action, expectedPayRate: rate(action) };
    switch (action) {
      case "friendly_nudge":
        return { ...base, title: "Friendly nudge", rationale: "Reminder without pressure.", subject: `Quick reminder: invoice ${i.invoiceNumber}`, message: `Hi ${i.client}, just a friendly reminder that invoice ${i.invoiceNumber} for ${money} was due ${i.daysOverdue} days ago. You can pay it directly from this PayPal email. Thank you!` };
      case "firm_reminder":
        return { ...base, title: "Firm reminder with a date", rationale: "Clear date for a client who tends to delay.", subject: `Invoice ${i.invoiceNumber} is ${i.daysOverdue} days overdue`, message: `Hi ${i.client}, invoice ${i.invoiceNumber} for ${money} is now ${i.daysOverdue} days overdue. Please arrange payment within 3 days through the PayPal link in this email. Let me know if anything is unclear.` };
      case "early_pay_discount":
        return { ...base, discountPct: Math.min(5, maxDiscount), title: `${Math.min(5, maxDiscount)}% off if paid in 3 days`, rationale: "Incentive to pay now.", subject: `Updated invoice: ${Math.min(5, maxDiscount)}% off ${i.invoiceNumber}`, message: `Hi ${i.client}, to make settling easier I've reissued invoice ${i.invoiceNumber} with a ${Math.min(5, maxDiscount)}% discount if paid within 3 days.` };
      case "split_payment":
        return { ...base, installments: 2, title: "Split into 2 installments", rationale: "Smaller amounts for a client with cash-flow pressure.", subject: `Invoice ${i.invoiceNumber} split into 2 payments`, message: `Hi ${i.client}, I've split invoice ${i.invoiceNumber} (${money}) into two payments, one week apart, to make it easier. Each arrives as its own PayPal invoice.` };
      case "personal_call":
        return { ...base, title: "Call the client", rationale: "Talk before sending more emails.", subject: "Call script", message: `Ask ${i.client} whether invoice ${i.invoiceNumber} reached the right person and whether anything about the work needs fixing before payment.` };
    }
  };

  return {
    likelyReason: reason,
    confidence: h.paid >= 2 ? 0.65 : 0.4,
    summary: `${i.client} is ${i.daysOverdue} days overdue on ${money}. Segment ${h.segment} (${h.segmentRule}); the rule engine picks the strategy with the best measured pay rate that has not already failed on this case.`,
    evidence: [
      { claim: `${i.daysOverdue} days overdue, ${i.remindersSent} reminders sent`, source: inv.callId, kind: "fact" },
      { claim: `Client segment ${h.segment}: ${h.segmentRule}`, source: hist.callId, kind: "fact" },
      { claim: `Best measured strategy for ${h.segment}: ${pick[0]} (pay rate ${rate(pick[0])})`, source: book.callId, kind: "fact" },
      { claim: "Reason for lateness is inferred from the segment, not observed", source: "none", kind: "assumption" },
    ],
    options: pick.map(make),
    recommended: 0,
    considered: "Rule engine: no competing explanation is evaluated.",
  };
}
