import { addDays, nowWith, realToday } from "./clock";
import { paypal } from "./paypal";
import { db, save } from "./store";
import { emit, getCase, setPhase } from "./trace";
import type { Invoice, PlanOption } from "./types";

// The single write path to PayPal. Runs only after policy (auto) or a person's approval.
// Idempotent per attempt: an attempt that already executed is never executed again.

function logPayPal(caseId: string) {
  for (const call of paypal().drainCalls()) {
    emit(caseId, {
      kind: "paypal",
      actor: "paypal",
      title: `${call.method} ${call.path}`,
      detail: `HTTP ${call.status}, ${call.ms} ms${call.debugId && call.debugId !== "sim" ? `, debug id ${call.debugId}` : ""}`,
      data: call,
    });
  }
}

export async function execute(caseId: string, option: PlanOption, decidedBy: "agent" | "person") {
  const s = db();
  const c = getCase(caseId);
  const attempt = c.attempts[c.attempts.length - 1];
  if (attempt.executedAt) return; // idempotency
  const original = s.invoices.find((i) => i.id === c.invoiceId)!;
  const demoNow = nowWith(s.clockOffsetDays).toISOString();
  const demoToday = demoNow.slice(0, 10);
  const pp = paypal();

  setPhase(caseId, 4, "EXECUTING");
  emit(caseId, {
    kind: "phase",
    actor: "code",
    title: `Executing "${option.title}" in PayPal`,
    detail: decidedBy === "person" ? "Approved by the business owner" : "Allowed by policy without a person",
    important: true,
  });

  // The invoice(s) currently owed on this case.
  const active = c.activeInvoiceIds.map((id) => s.invoices.find((i) => i.id === id)!).filter(Boolean);

  try {
    switch (option.action) {
      case "friendly_nudge":
      case "firm_reminder": {
        for (const inv of active) {
          await pp.remind(inv.id, option.subject, option.message);
          inv.remindersSent += 1;
          inv.lastReminderAt = demoNow;
        }
        break;
      }
      case "early_pay_discount":
      case "split_payment": {
        const owed = active.reduce((a, i) => a + i.amount, 0);
        for (const inv of active) {
          await pp.cancel(inv.id, `Invoice ${inv.number} replaced`, `This invoice is replaced by an updated one: ${option.title}.`);
          inv.status = "CANCELLED";
        }
        const parts: Array<{ amount: number; due: string; label: string }> = [];
        if (option.action === "early_pay_discount") {
          const pct = option.discountPct ?? 5;
          parts.push({
            amount: Math.round(owed * (1 - pct / 100) * 100) / 100,
            due: addDays(demoToday, 3),
            label: `${original.description} (${pct}% early-payment discount)`,
          });
        } else {
          const n = Math.min(3, Math.max(2, option.installments ?? 2));
          const each = Math.floor((owed / n) * 100) / 100;
          for (let k = 0; k < n; k++) {
            parts.push({
              amount: k === n - 1 ? Math.round((owed - each * (n - 1)) * 100) / 100 : each,
              due: addDays(demoToday, 3 + 7 * k),
              label: `${original.description} (installment ${k + 1} of ${n})`,
            });
          }
        }
        const created: Invoice[] = [];
        for (const p of parts) {
          const remote = await pp.createAndSend(
            {
              clientName: original.clientName,
              clientEmail: original.clientEmail,
              description: p.label,
              amount: p.amount,
              currency: original.currency,
              invoiceDate: realToday(),
              dueDate: p.due,
              note: option.message,
            },
            option.subject,
          );
          const inv: Invoice = {
            id: remote.id,
            number: remote.number,
            clientName: original.clientName,
            clientEmail: original.clientEmail,
            description: p.label,
            amount: p.amount,
            currency: original.currency,
            issueDate: demoToday,
            dueDate: p.due,
            status: remote.status,
            payUrl: remote.payUrl,
            remindersSent: 0,
            replaces: original.id,
            caseId,
            source: pp.mode === "sandbox" ? "paypal" : "simulated",
          };
          s.invoices.push(inv);
          created.push(inv);
        }
        for (const inv of active) inv.replacedBy = created.map((x) => x.id).join(",");
        c.activeInvoiceIds = created.map((x) => x.id);
        break;
      }
      case "personal_call": {
        emit(caseId, {
          kind: "human",
          actor: "person",
          title: "Call task created for the business owner",
          detail: option.message,
          important: true,
        });
        break;
      }
    }
  } catch (e) {
    logPayPal(caseId);
    c.status = "ERROR";
    save();
    emit(caseId, { kind: "error", actor: "paypal", title: "PayPal call failed", detail: e instanceof Error ? e.message : String(e), important: true });
    throw e;
  }

  logPayPal(caseId);
  attempt.executedAt = demoNow;
  attempt.decidedBy = decidedBy;
  c.status = "WAITING_PAYMENT";
  c.phase = 5;
  save();
  emit(caseId, {
    kind: "verify",
    actor: "code",
    title: "Waiting for PayPal to report payment",
    detail: `The case closes only when PayPal marks ${c.activeInvoiceIds.length > 1 ? "every installment" : "the invoice"} PAID. If nothing arrives within ${s.settings.paymentWindowDays} days, the agent escalates.`,
    important: true,
  });
}
