// Tool schemas are plain JSON Schema so any function-calling model can use them.
export interface ToolDef { name: string; description: string; input_schema: Record<string, unknown> }
import { ACTION_LIBRARY } from "../library";
import { playbookFor, profileFor, suspicious } from "../clients";
import { daysBetween, isoDate, nowWith } from "../clock";
import { paypal } from "../paypal";
import { db } from "../store";
import type { CollectionCase } from "../types";

// Read-only tools for the collections agent. None of them can change anything in PayPal.
// Every tool takes `why`: one sentence on what the agent wants to find out. It is shown live in the trace.

const WHY = {
  type: "string",
  description: "One short sentence: what you want to find out with this call and why it matters for the plan.",
} as const;

export const READ_TOOLS: ToolDef[] = [
  {
    name: "get_invoice",
    description:
      "Fetch the overdue invoice live from PayPal (status, amount, due date) plus how many days overdue it is and how many reminders were already sent.",
    input_schema: { type: "object", properties: { why: WHY }, required: ["why"] },
  },
  {
    name: "get_client_history",
    description:
      "Payment history for this client across all invoices: paid count, average and max days late, reminders usually needed, and the client segment computed by code (reliable, slow_payer, habitual_late, new). Also returns any client notes.",
    input_schema: { type: "object", properties: { why: WHY }, required: ["why"] },
  },
  {
    name: "get_reminder_log",
    description:
      "Earlier attempts on THIS case: which strategy was used, when, and whether the client paid. Empty on the first attempt.",
    input_schema: { type: "object", properties: { why: WHY }, required: ["why"] },
  },
  {
    name: "get_playbook",
    description:
      "Measured outcomes of each collection strategy for a client segment in this business: tries, paid, payRate (Laplace-smoothed) and average days to pay. Copy payRate exactly into expectedPayRate.",
    input_schema: {
      type: "object",
      properties: {
        why: WHY,
        segment: { type: "string", enum: ["reliable", "slow_payer", "habitual_late", "new"] },
      },
      required: ["why", "segment"],
    },
  },
  {
    name: "get_action_library",
    description:
      "The only actions you may propose, what each does in PayPal, its limits, and the business settings (max discount, approval threshold).",
    input_schema: { type: "object", properties: { why: WHY }, required: ["why"] },
  },
];

export const SUBMIT_PLAN: ToolDef = {
  name: "submit_plan",
  description:
    "Submit your final collection plan. Code validates it: every fact must cite a call_id you received, expectedPayRate must match get_playbook, actions must come from the library. If validation fails you get the problems back and must fix them.",
  input_schema: {
    type: "object",
    properties: {
      likelyReason: {
        type: "string",
        enum: ["forgot", "cash_flow", "unhappy_with_work", "wrong_contact", "habitual_late_payer", "unknown"],
      },
      confidence: { type: "number", description: "0 to 1" },
      summary: { type: "string", description: "Two sentences for the business owner: what is going on and what you recommend." },
      evidence: {
        type: "array",
        items: {
          type: "object",
          properties: {
            claim: { type: "string" },
            source: { type: "string", description: "call_id from a tool result, e.g. call_2. Use 'none' for assumptions/unknowns." },
            kind: { type: "string", enum: ["fact", "assumption", "unknown"] },
          },
          required: ["claim", "source", "kind"],
        },
      },
      options: {
        type: "array",
        description: "2 or 3 options, best first or not, from the action library.",
        items: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["friendly_nudge", "firm_reminder", "early_pay_discount", "split_payment", "personal_call"],
            },
            title: { type: "string" },
            rationale: { type: "string" },
            subject: { type: "string", description: "Email subject the client will see (PayPal sends it)." },
            message: {
              type: "string",
              description:
                "The note the client reads in the PayPal email. Polite, specific, mention invoice number and amount, no threats. For personal_call: the call script.",
            },
            discountPct: { type: "number" },
            installments: { type: "integer" },
            expectedPayRate: { type: "number", description: "Copied exactly from get_playbook for this action." },
          },
          required: ["action", "title", "rationale", "subject", "message"],
        },
      },
      recommended: { type: "integer", description: "Index into options of your recommendation." },
      considered: {
        type: "string",
        description: "The closest competing explanation and the evidence that weakened it.",
      },
    },
    required: ["likelyReason", "confidence", "summary", "evidence", "options", "recommended", "considered"],
  },
};

export type ToolName = "get_invoice" | "get_client_history" | "get_reminder_log" | "get_playbook" | "get_action_library";

export const TOOL_LABEL: Record<string, string> = {
  get_invoice: "Read invoice from PayPal",
  get_client_history: "Read client payment history",
  get_reminder_log: "Read earlier attempts",
  get_playbook: "Read strategy outcomes",
  get_action_library: "Read allowed actions",
  submit_plan: "Submit plan",
};

/** Execute a read tool. Returns JSON-serialisable output. */
export async function runReadTool(c: CollectionCase, name: string, input: Record<string, unknown>): Promise<unknown> {
  const s = db();
  const inv = s.invoices.find((i) => i.id === c.invoiceId);
  if (!inv) throw new Error("Invoice missing");
  const today = isoDate(nowWith(s.clockOffsetDays));

  switch (name as ToolName) {
    case "get_invoice": {
      // Live read from PayPal (sandbox or simulator) so the agent never works on a stale status.
      const remote = await paypal().get(inv.id);
      return {
        invoiceNumber: remote.number,
        status: remote.status,
        amount: inv.amount,
        currency: inv.currency,
        description: inv.description,
        descriptionFlag: suspicious(inv.description) ? "suspicious_instruction" : undefined,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        today,
        daysOverdue: daysBetween(inv.dueDate, today),
        remindersSent: inv.remindersSent,
        lastReminderAt: inv.lastReminderAt?.slice(0, 10) ?? null,
        client: inv.clientName,
      };
    }
    case "get_client_history": {
      const p = profileFor(s, inv.clientName, inv.id);
      const past = s.invoices
        .filter((i) => i.clientName === inv.clientName && i.id !== inv.id)
        .map((i) => ({
          number: i.number,
          amount: i.amount,
          dueDate: i.dueDate,
          paidDaysLate: i.paidAt ? Math.max(0, daysBetween(i.dueDate, i.paidAt)) : null,
          remindersNeeded: i.remindersSent,
          status: i.status,
          source: i.history ? "seed history (synthetic)" : i.source,
        }));
      const note = (await import("../seed")).DEMO_CLIENTS.find((d) => d.name === inv.clientName)?.note ?? null;
      return { ...p, invoices: past, clientNote: note, clientNoteFlag: note && suspicious(note) ? "suspicious_instruction" : undefined };
    }
    case "get_reminder_log": {
      return {
        attempt: c.attempts.length,
        earlier: c.attempts.slice(0, -1).map((a) => {
          const opt = a.plan && a.chosen !== undefined ? a.plan.options[a.chosen] : undefined;
          return {
            attempt: a.n,
            action: opt?.action ?? null,
            discountPct: opt?.discountPct ?? null,
            installments: opt?.installments ?? null,
            executedAt: a.executedAt?.slice(0, 10) ?? null,
            outcome: a.outcome ?? "pending",
          };
        }),
      };
    }
    case "get_playbook": {
      const segment = String(input.segment ?? "new");
      return { segment, strategies: playbookFor(s, segment), note: "payRate = (paid+1)/(tries+2). Small counts: say so." };
    }
    case "get_action_library": {
      return {
        actions: ACTION_LIBRARY,
        settings: {
          maxDiscountPct: s.settings.maxDiscountPct,
          approvalThreshold: s.settings.approvalThreshold,
          reminderCooldownDays: s.settings.reminderCooldownDays,
          autonomy: s.settings.autonomy,
        },
      };
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}
