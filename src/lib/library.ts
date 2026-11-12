import type { ActionType } from "./types";

// The only actions an agent may propose. Each maps to a fixed PayPal call sequence in executor.ts.

export interface ActionSpec {
  action: ActionType;
  label: string;
  paypal: string; // what the executor will do in PayPal
  changesMoney: boolean;
  limits?: string;
  when: string;
}

export const ACTION_LIBRARY: ActionSpec[] = [
  {
    action: "friendly_nudge",
    label: "Friendly nudge",
    paypal: "POST /v2/invoicing/invoices/{id}/remind with a warm note",
    changesMoney: false,
    when: "Client probably forgot. Reliable payers, first reminder.",
  },
  {
    action: "firm_reminder",
    label: "Firm reminder with a date",
    paypal: "POST /v2/invoicing/invoices/{id}/remind with a clear pay-by date",
    changesMoney: false,
    when: "Habitual late payers, or a friendly nudge already failed.",
  },
  {
    action: "early_pay_discount",
    label: "Early-payment discount",
    paypal: "cancel the invoice, create a discounted invoice due in 3 days, send it",
    changesMoney: true,
    limits: "discountPct between 2 and the business's maximum (see settings in the tool output)",
    when: "Client responds to incentives; amount is large enough that waiting costs more than the discount.",
  },
  {
    action: "split_payment",
    label: "Split into installments",
    paypal: "cancel the invoice, create and send 2 or 3 installment invoices due 7 days apart",
    changesMoney: true,
    limits: "installments: 2 or 3",
    when: "Client has cash-flow trouble; history shows partial or very late payments.",
  },
  {
    action: "personal_call",
    label: "Personal call (no PayPal action)",
    paypal: "none, creates a call task with a script for the business owner",
    changesMoney: false,
    when: "Possible dispute about the work, wrong contact, or repeated failures.",
  },
];

export const ACTION_LABEL: Record<ActionType, string> = Object.fromEntries(
  ACTION_LIBRARY.map((a) => [a.action, a.label]),
) as Record<ActionType, string>;
