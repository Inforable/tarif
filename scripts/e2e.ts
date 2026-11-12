// End-to-end check of the case lifecycle against the PayPal simulator and the rule engine.
// Run: npm run e2e   (uses a throwaway data dir; never touches PayPal sandbox)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.TAGIH_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tagih-e2e-"));
delete process.env.PAYPAL_CLIENT_ID;
delete process.env.PAYPAL_CLIENT_SECRET;
if (!process.env.E2E_USE_MODEL) delete process.env.OPENAI_API_KEY;
// always the file store, never a shared Redis
for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"]) delete process.env[k];

let failures = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  (${extra})` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const cases = await import("../src/lib/cases");
  const { db } = await import("../src/lib/store");

  await cases.reset();
  await cases.createDemoInvoices();
  const open = db().invoices.filter((i) => !i.history);
  check("4 demo invoices created and SENT", open.length === 4 && open.every((i) => i.status === "SENT"));

  let r = await cases.sync();
  check("no case before due date", r.opened.length === 0);

  r = await cases.advanceClock(7);
  check("4 cases open after 7 days", r.opened.length === 4, `${r.opened.length}`);

  for (const id of r.opened) await cases.startRun(id);
  const byClient = (name: string) => {
    const inv = db().invoices.find((i) => i.clientName === name && !i.history && !i.replaces)!;
    return db().cases.find((c) => c.invoiceId === inv.id)!;
  };
  for (const c of db().cases) {
    const plan = c.attempts[0].plan;
    check(`agent planned ${c.id}`, Boolean(plan) && c.status === "AWAITING_APPROVAL", `${c.status}, ${plan?.options[plan.recommended].action}`);
    check(`trace has tool calls ${c.id}`, c.trace.filter((t) => t.kind === "tool").length >= 3);
  }

  // Studio Rimba: approve, client pays, case closes.
  const rimba = byClient("Studio Rimba");
  const rec = rimba.attempts[0].plan!.recommended;
  await cases.approve(rimba.id, rec, { message: "Hi, a gentle reminder about this invoice. Thank you." });
  check("Rimba waiting for payment after approval", rimba.status === "WAITING_PAYMENT");
  const rimbaInv = db().invoices.find((i) => i.id === rimba.activeInvoiceIds[0])!;
  check("reminder recorded", rimbaInv.remindersSent === 1);
  let threw = false;
  try {
    await cases.approve(rimba.id, rec);
  } catch {
    threw = true;
  }
  check("double approval rejected (idempotent)", threw);
  await cases.simulatePayment(rimbaInv.id);
  check("Rimba PAID after PayPal reports payment", rimba.status === "PAID");

  // Kopi Lereng: split payment, nothing paid, reopen with attempt 2.
  const kopi = byClient("Kopi Lereng");
  const splitIdx = kopi.attempts[0].plan!.options.findIndex((o) => o.action === "split_payment");
  const idx = splitIdx >= 0 ? splitIdx : kopi.attempts[0].plan!.recommended;
  await cases.approve(kopi.id, idx);
  check("Kopi executed", kopi.status === "WAITING_PAYMENT", kopi.attempts[0].plan!.options[idx].action);
  if (splitIdx >= 0) {
    const orig = db().invoices.find((i) => i.id === kopi.invoiceId)!;
    check("original cancelled and installments created", orig.status === "CANCELLED" && kopi.activeInvoiceIds.length === 2);
  }
  r = await cases.advanceClock(5);
  check("Kopi reopened after payment window", r.reopened.includes(kopi.id) && kopi.attempts.length === 2, kopi.status);
  await cases.startRun(kopi.id);
  const a2 = kopi.attempts[1].plan;
  const firstAction = kopi.attempts[0].plan!.options[idx].action;
  check("attempt 2 does not repeat the failed action", Boolean(a2) && a2!.options[a2!.recommended].action !== firstAction, a2?.options[a2.recommended].action);

  // Playbook learned.
  const learned = db().playbook.reduce((a, p) => a + p.tries, 0);
  check("playbook updated", learned > 0);

  // Policy-based autonomy: a reliable client, small amount, plain reminder runs without a person.
  await cases.reset();
  cases.setAutonomy("policy_based");
  await cases.createDemoInvoices();
  r = await cases.advanceClock(7);
  await new Promise((res) => setTimeout(res, 300));
  for (const id of r.opened) await cases.startRun(id);
  const rimba2 = byClient("Studio Rimba");
  check("policy-based: Rimba executed without a person", rimba2.status === "WAITING_PAYMENT", rimba2.status);
  const kopi2 = byClient("Kopi Lereng");
  check("policy-based: Kopi (over threshold) still waits for a person", kopi2.status === "AWAITING_APPROVAL", kopi2.status);

  // P5 cooldown: a second reminder inside 3 days is blocked.
  const policy = await import("../src/lib/policy");
  const inv = db().invoices.find((i) => i.id === rimba2.activeInvoiceIds[0])!;
  const p = policy.evaluatePolicy(db(), rimba2, inv, "SENT", rimba2.attempts[0].plan!.options[0], 0.9);
  check("P5 blocks a reminder inside the cooldown", p.verdict === "blocked" && p.checks.some((c) => c.id === "P5" && c.outcome === "block"));

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
