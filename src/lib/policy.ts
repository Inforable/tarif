import { daysBetween, isoDate, nowWith } from "./clock";
import { ACTION_LIBRARY } from "./library";
import { suspicious } from "./clients";
import { DEMO_CLIENTS } from "./seed";
import type { CollectionCase, Invoice, InvoiceStatus, PlanOption, PolicyCheck, PolicyResult, StoreShape } from "./types";

// Deterministic policy. The only thing that decides whether an action may run without a person.
// It reads the plan as data; nothing the model writes can switch a rule off.

const COLLECTIBLE: InvoiceStatus[] = ["SENT", "UNPAID", "PARTIALLY_PAID", "SCHEDULED", "PAYMENT_PENDING"];

export function evaluatePolicy(
  s: StoreShape,
  c: CollectionCase,
  inv: Invoice,
  liveStatus: InvoiceStatus,
  option: PlanOption,
  confidence: number,
): PolicyResult {
  const st = s.settings;
  const today = isoDate(nowWith(s.clockOffsetDays));
  const spec = ACTION_LIBRARY.find((a) => a.action === option.action);
  const isReminder = option.action === "friendly_nudge" || option.action === "firm_reminder";
  const sinceReminder = inv.lastReminderAt ? daysBetween(inv.lastReminderAt, today) : null;
  const flagged = suspicious(inv.description) || suspicious(DEMO_CLIENTS.find((d) => d.name === inv.clientName)?.note ?? "");

  const checks: PolicyCheck[] = [
    {
      id: "P1",
      rule: `Amount at or below ${st.approvalThreshold} ${inv.currency}`,
      outcome: inv.amount > st.approvalThreshold ? "needs_person" : "pass",
      detail: `${inv.currency} ${inv.amount.toFixed(2)}`,
    },
    {
      id: "P2",
      rule: "Action does not change what the client owes",
      outcome: spec?.changesMoney ? "needs_person" : "pass",
      detail: spec?.changesMoney ? `${spec.label} changes the amount or schedule` : `${spec?.label ?? option.action} keeps the invoice as is`,
    },
    {
      id: "P3",
      rule: "Agent confidence at least 0.6",
      outcome: confidence < 0.6 ? "needs_person" : "pass",
      detail: `confidence ${confidence.toFixed(2)}`,
    },
    {
      id: "P4",
      rule: "First or second attempt on this case",
      outcome: c.attempts.length >= 3 ? "needs_person" : "pass",
      detail: `attempt ${c.attempts.length}`,
    },
    {
      id: "P5",
      rule: `No reminder in the last ${st.reminderCooldownDays} days`,
      outcome: isReminder && sinceReminder !== null && sinceReminder < st.reminderCooldownDays ? "block" : "pass",
      detail: sinceReminder === null ? "no reminder sent yet" : `last reminder ${sinceReminder} days ago`,
    },
    {
      id: "P6",
      rule: "Invoice is still collectible in PayPal",
      outcome: COLLECTIBLE.includes(liveStatus) ? "pass" : "block",
      detail: `PayPal status ${liveStatus}`,
    },
    {
      id: "P7",
      rule: `Discount within ${st.maxDiscountPct}% and no instruction-like client data`,
      outcome:
        option.discountPct !== undefined && option.discountPct > st.maxDiscountPct
          ? "block"
          : flagged
            ? "needs_person"
            : "pass",
      detail: flagged
        ? "client data contains text that reads like an instruction to the AI"
        : option.discountPct !== undefined
          ? `discount ${option.discountPct}%`
          : "no discount, data clean",
    },
    {
      id: "AUTONOMY",
      rule: "Owner allows policy-based autonomy",
      outcome: st.autonomy === "always_ask" ? "needs_person" : "pass",
      detail: st.autonomy === "always_ask" ? "mode: always ask" : "mode: policy based",
    },
  ];

  const verdict = checks.some((x) => x.outcome === "block")
    ? "blocked"
    : checks.some((x) => x.outcome === "needs_person")
      ? "needs_person"
      : "auto";
  return { verdict, checks };
}
