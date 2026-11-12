import { runModelAgent, hasModel, currentModel } from "./agent/agent";
import { rulePlan } from "./agent/rules";
import { READ_TOOLS, TOOL_LABEL, runReadTool } from "./agent/tools";
import type { ToolCallRecord } from "./agent/validate";
import { ACTION_LABEL } from "./library";
import { daysBetween, isoDate, nowWith, realToday, addDays } from "./clock";
import { profileFor, outstanding } from "./clients";
import { execute } from "./executor";
import { paypal, demoRecipient, simulator } from "./paypal";
import { evaluatePolicy } from "./policy";
import { DEMO_CLIENTS } from "./seed";
import { db, hydrate, lock, mutate, nextId, resetStore, save, setLocalOwnership, unlock } from "./store";
import { emit, getCase, setPhase } from "./trace";
import type { CollectionCase, Invoice, PlanOption } from "./types";

// Orchestration: signal, agent, validation, policy, (approval), executor, verifier, playbook.

const running = new Set<string>();
// While this instance runs an agent on a case, its in-memory copy is the authoritative one.
setLocalOwnership((id) => running.has(id), () => running.clear());

const CASE_LOCK_MS = 300_000;
const caseLock = (id: string) => `case:${id}`;

/** Marks a case busy for every instance (the case page polls fast and shows "Agent working"). */
function markBusy(caseId: string, on: boolean) {
  const c = db().cases.find((x) => x.id === caseId);
  if (!c) return;
  if (on) c.busyUntil = Date.now() + CASE_LOCK_MS;
  else delete c.busyUntil;
  save();
}

// Work that must outlive the HTTP response (agent runs). Routes hand these to next/server after(),
// so serverless hosts such as Vercel keep the function alive until they finish.
const pending: Promise<unknown>[] = [];
export function background(p: Promise<unknown>) {
  pending.push(p.catch(() => {}));
}
export function takeBackground() {
  return pending.splice(0);
}

function demoNowIso() {
  return nowWith(db().clockOffsetDays).toISOString();
}

export function engineName() {
  return hasModel() ? currentModel() : "rules";
}

/* ---------------- invoices ---------------- */

export interface InvoiceDraftInput {
  clientName: string;
  clientEmail: string;
  description: string;
  amount: number;
  currency: string;
  dueInDays: number;
  note?: string;
}

export async function createInvoice(d: InvoiceDraftInput): Promise<Invoice> {
  const pp = paypal();
  const s = db();
  const demoToday = isoDate(nowWith(s.clockOffsetDays));
  const due = addDays(demoToday, Math.max(0, d.dueInDays));
  const remote = await pp.createAndSend({
    clientName: d.clientName,
    clientEmail: demoRecipient(d.clientEmail),
    description: d.description,
    amount: d.amount,
    currency: d.currency,
    invoiceDate: realToday(),
    dueDate: due,
    note: d.note,
  });
  pp.drainCalls();
  const inv: Invoice = {
    id: remote.id,
    number: remote.number,
    clientName: d.clientName,
    clientEmail: demoRecipient(d.clientEmail),
    description: d.description,
    amount: d.amount,
    currency: d.currency,
    issueDate: demoToday,
    dueDate: due,
    status: remote.status,
    payUrl: remote.payUrl,
    remindersSent: 0,
    source: pp.mode === "sandbox" ? "paypal" : "simulated",
  };
  mutate((st) => st.invoices.push(inv));
  return inv;
}

export async function createDemoInvoices() {
  const s = db();
  const existing = new Set(s.invoices.filter((i) => !i.history).map((i) => i.clientName));
  for (const c of DEMO_CLIENTS) {
    if (existing.has(c.name)) continue;
    const slug = c.name.toLowerCase().replace(/[^a-z]+/g, "");
    await createInvoice({
      clientName: c.name,
      clientEmail: `billing@${slug}.example.com`,
      description: c.description,
      amount: c.amount,
      currency: "USD",
      dueInDays: c.dueInDays,
    });
  }
}

/* ---------------- sync: PayPal status, overdue signal, verifier ---------------- */

export async function sync(): Promise<{ opened: string[]; paid: string[]; reopened: string[] }> {
  let s = db();
  const pp = paypal();
  const demoToday = isoDate(nowWith(s.clockOffsetDays));
  const opened: string[] = [];
  const paid: string[] = [];
  const reopened: string[] = [];

  // 1. Refresh live status from PayPal for every open invoice we created.
  for (const inv of s.invoices.filter((i) => !i.history && outstanding(i))) {
    try {
      const r = await pp.get(inv.id);
      inv.status = r.status;
      if (r.payUrl) inv.payUrl = r.payUrl;
      if ((r.status === "PAID" || r.status === "MARKED_AS_PAID") && !inv.paidAt) inv.paidAt = demoNowIso();
    } catch {
      // keep last known status; the case trace shows PayPal errors when they matter
    }
  }
  pp.drainCalls();
  save();

  // 2. Overdue signal: one case per invoice. Locked so two instances never open the same case twice.
  if (await lock("signal", 30_000)) {
    try {
      await hydrate();
      s = db();
      for (const inv of s.invoices) {
    if (inv.history || inv.caseId || inv.replaces || !outstanding(inv)) continue;
    if (daysBetween(inv.dueDate, demoToday) <= 0) continue;
    const id = await nextId("CASE");
    const c: CollectionCase = {
      id,
      invoiceId: inv.id,
      activeInvoiceIds: [inv.id],
      status: "OPEN",
      phase: 0,
      openedAt: demoNowIso(),
      attempts: [{ n: 1 }],
      trace: [],
    };
    inv.caseId = id;
    s.cases.unshift(c);
    save();
    emit(id, {
      kind: "signal",
      actor: "code",
      title: `Invoice ${inv.number} is ${daysBetween(inv.dueDate, demoToday)} days overdue`,
      detail: `${inv.clientName}, ${inv.currency} ${inv.amount.toFixed(2)}, PayPal status ${inv.status}`,
      important: true,
    });
    opened.push(id);
      }
    } finally {
      await unlock("signal");
    }
  }

  // 3. Verifier for cases waiting on payment. Skips cases another instance is working on.
  for (const c of s.cases.filter((x) => x.status === "WAITING_PAYMENT")) {
    if (!(await lock(caseLock(c.id), 60_000))) continue;
    try {
    const active = c.activeInvoiceIds.map((id) => s.invoices.find((i) => i.id === id)!).filter(Boolean);
    const attempt = c.attempts[c.attempts.length - 1];
    const option = attempt.plan && attempt.chosen !== undefined ? attempt.plan.options[attempt.chosen] : undefined;
    const segment = profileFor(s, s.invoices.find((i) => i.id === c.invoiceId)!.clientName, c.invoiceId).segment;

    if (active.every((i) => i.status === "PAID" || i.status === "MARKED_AS_PAID")) {
      const days = Math.max(0, daysBetween(attempt.executedAt ?? demoToday, demoToday));
      attempt.outcome = "paid";
      c.status = "PAID";
      c.phase = 6;
      c.closedAt = demoNowIso();
      if (option) learn(option.action, segment, true, days);
      save();
      emit(c.id, {
        kind: "verify",
        actor: "paypal",
        title: "PayPal reports the invoice PAID",
        detail: `${active.map((i) => i.number).join(", ")} paid ${days} day(s) after "${option?.title ?? "the action"}". Case closed.`,
        important: true,
      });
      if (option) {
        emit(c.id, {
          kind: "learn",
          actor: "code",
          title: `Playbook updated: ${ACTION_LABEL[option.action]} worked for a ${segment} client`,
          detail: "Next plans for this segment read the new rate.",
        });
      }
      paid.push(c.id);
      continue;
    }

    const waited = attempt.executedAt ? daysBetween(attempt.executedAt, demoToday) : 0;
    if (waited >= s.settings.paymentWindowDays) {
      attempt.outcome = "not_paid";
      if (option) learn(option.action, segment, false, 0);
      emit(c.id, {
        kind: "verify",
        actor: "code",
        title: `No payment ${waited} days after "${option?.title ?? "the action"}"`,
        detail: `PayPal still shows ${active.map((i) => `${i.number} ${i.status}`).join(", ")}.`,
        important: true,
      });
      if (c.attempts.length >= 3) {
        c.status = "ESCALATED";
        save();
        emit(c.id, { kind: "human", actor: "person", title: "Escalated to the business owner", detail: "Three strategies did not get this invoice paid.", important: true });
      } else {
        c.attempts.push({ n: c.attempts.length + 1 });
        c.status = "OPEN";
        c.phase = 0;
        save();
        emit(c.id, { kind: "signal", actor: "code", title: `Case reopened for attempt ${c.attempts.length}`, detail: "The agent will plan again knowing what failed.", important: true });
        reopened.push(c.id);
      }
    }
    } finally {
      await unlock(caseLock(c.id));
    }
  }

  // Autonomy: in policy-based mode new and reopened cases start on their own.
  if (s.settings.autonomy === "policy_based") {
    for (const id of [...opened, ...reopened]) background(startRun(id));
  }
  return { opened, paid, reopened };
}

function learn(action: PlanOption["action"], segment: string, success: boolean, days: number) {
  const s = db();
  let row = s.playbook.find((p) => p.action === action && p.segment === segment);
  if (!row) {
    row = { action, segment, tries: 0, paid: 0, totalDaysToPay: 0 };
    s.playbook.push(row);
  }
  row.tries += 1;
  if (success) {
    row.paid += 1;
    row.totalDaysToPay += days;
  }
  save();
}

/* ---------------- agent run ---------------- */

export function isRunning(id: string) {
  if (running.has(id)) return true;
  const c = db().cases.find((x) => x.id === id);
  return Boolean(c?.busyUntil && c.busyUntil > Date.now());
}

/** Starts the agent in the background. The case page polls the trace while it runs. */
export async function startRun(caseId: string) {
  const c = getCase(caseId);
  if ((isRunning(caseId) && !running.has(caseId)) || !["OPEN", "ERROR", "BLOCKED"].includes(c.status)) return;
  if (!(await lock(caseLock(caseId), CASE_LOCK_MS))) return;
  running.add(caseId);
  markBusy(caseId, true);
  try {
    await runCase(caseId);
  } catch (e) {
    const cc = db().cases.find((x) => x.id === caseId);
    if (cc) {
      cc.status = "ERROR";
      save();
      emit(caseId, { kind: "error", actor: "code", title: "Run stopped", detail: e instanceof Error ? e.message : String(e), important: true });
    }
  } finally {
    running.delete(caseId);
    markBusy(caseId, false);
    await unlock(caseLock(caseId));
  }
}

async function runCase(caseId: string) {
  const s = db();
  const c = getCase(caseId);
  if (c.status === "BLOCKED" || c.status === "ERROR") {
    // re-run of the same attempt: start a clean attempt record
    c.attempts[c.attempts.length - 1] = { n: c.attempts.length };
  }
  c.status = "RUNNING";
  c.startedRunAt = Date.now();
  setPhase(caseId, 1);
  emit(caseId, {
    kind: "phase",
    actor: "code",
    title: `Agent started (attempt ${c.attempts.length})`,
    detail: hasModel() ? `Engine ${currentModel()}. The model decides which tools to call.` : "No OPENAI_API_KEY set: the rule engine runs the same tools.",
    engine: engineName(),
    important: true,
  });

  let plan;
  let calls: ToolCallRecord[] = [];
  let engine = "rules";
  if (hasModel()) {
    try {
      const r = await runModelAgent(caseId);
      plan = r.plan;
      calls = r.calls;
      engine = r.engine;
    } catch (e) {
      emit(caseId, {
        kind: "fallback",
        actor: "code",
        title: "Model run failed, rule engine takes over",
        detail: e instanceof Error ? e.message : String(e),
        engine: "rules",
        important: true,
      });
    }
  }
  if (!plan) {
    calls = [];
    const inv = s.invoices.find((i) => i.id === c.invoiceId)!;
    const segment = profileFor(s, inv.clientName, inv.id).segment;
    const steps: Array<[string, Record<string, unknown>]> = [
      ["get_invoice", { why: "Confirm status and days overdue in PayPal" }],
      ["get_client_history", { why: "Segment the client from payment history" }],
      ["get_reminder_log", { why: "Exclude strategies that already failed" }],
      ["get_playbook", { why: "Rank strategies by measured pay rate", segment }],
    ];
    for (const [name, input] of steps) {
      const output = await runReadTool(getCase(caseId), name, input);
      const callId = `call_${calls.length + 1}`;
      calls.push({ callId, name, output });
      emit(caseId, { kind: "tool", actor: "code", engine: "rules", title: TOOL_LABEL[name], detail: String(input.why), data: { call_id: callId, tool: name, input, output } });
    }
    plan = rulePlan(calls, s.settings.maxDiscountPct);
    engine = "rules";
  }
  void READ_TOOLS;

  setPhase(caseId, 2);
  const attempt = getCase(caseId).attempts[getCase(caseId).attempts.length - 1];
  attempt.plan = plan;
  attempt.engine = engine;
  attempt.chosen = plan.recommended;
  save();
  const rec = plan.options[plan.recommended];
  emit(caseId, {
    kind: "decision",
    actor: engine === "rules" ? "code" : "agent",
    engine,
    title: `Recommends: ${rec.title}`,
    detail: plan.summary,
    data: { likelyReason: plan.likelyReason, confidence: plan.confidence, considered: plan.considered, evidence: plan.evidence },
    important: true,
  });

  await decide(caseId, plan.recommended);
}

/** Policy on the chosen option. Auto: execute. Needs person: wait. Blocked: stop. */
async function decide(caseId: string, optionIndex: number) {
  const s = db();
  const c = getCase(caseId);
  const attempt = c.attempts[c.attempts.length - 1];
  const plan = attempt.plan!;
  const option = plan.options[optionIndex];
  const inv = s.invoices.find((i) => i.id === c.activeInvoiceIds[0])!;
  setPhase(caseId, 3);
  let live = inv.status;
  try {
    live = (await paypal().get(inv.id)).status;
    inv.status = live;
  } catch {
    /* keep cached */
  }
  paypal().drainCalls();
  const policy = evaluatePolicy(s, c, inv, live, option, plan.confidence);
  attempt.policy = policy;
  save();
  const held = policy.checks.filter((x) => x.outcome !== "pass");
  emit(caseId, {
    kind: "policy",
    actor: "code",
    title:
      policy.verdict === "auto"
        ? "Policy: allowed without a person"
        : policy.verdict === "blocked"
          ? `Policy: blocked by ${held.filter((x) => x.outcome === "block").map((x) => x.id).join(", ")}`
          : `Policy: needs your approval (${held.map((x) => x.id).join(", ")})`,
    detail: held.length ? held.map((x) => `${x.id} ${x.rule}: ${x.detail}`).join("\n") : "Every rule passed.",
    data: policy,
    important: true,
  });

  if (policy.verdict === "blocked") {
    c.status = live === "PAID" || live === "MARKED_AS_PAID" ? "PAID" : "BLOCKED";
    save();
    return;
  }
  if (policy.verdict === "needs_person") {
    c.status = "AWAITING_APPROVAL";
    save();
    return;
  }
  await execute(caseId, option, "agent");
}

/* ---------------- human decisions ---------------- */

export async function approve(caseId: string, optionIndex: number, edits?: { subject?: string; message?: string }) {
  if (!(await lock(caseLock(caseId), 60_000))) throw new Error("Another step is working on this case. Try again in a moment.");
  try {
    await approveLocked(caseId, optionIndex, edits);
  } finally {
    await unlock(caseLock(caseId));
  }
}

async function approveLocked(caseId: string, optionIndex: number, edits?: { subject?: string; message?: string }) {
  const c = getCase(caseId);
  if (c.status !== "AWAITING_APPROVAL") throw new Error("This case is not waiting for approval");
  const attempt = c.attempts[c.attempts.length - 1];
  const plan = attempt.plan!;
  const option = { ...plan.options[optionIndex] };
  if (edits?.subject) option.subject = edits.subject;
  if (edits?.message) option.message = edits.message;
  plan.options[optionIndex] = option;
  attempt.chosen = optionIndex;
  save();

  // Re-check hard limits for the option the person picked (blocks still apply).
  const s = db();
  const inv = s.invoices.find((i) => i.id === c.activeInvoiceIds[0])!;
  const policy = evaluatePolicy(s, c, inv, inv.status, option, plan.confidence);
  const blocks = policy.checks.filter((x) => x.outcome === "block");
  if (blocks.length) {
    emit(caseId, { kind: "policy", actor: "code", title: `Blocked by ${blocks.map((b) => b.id).join(", ")}`, detail: blocks.map((b) => `${b.rule}: ${b.detail}`).join("\n"), important: true });
    throw new Error(`Blocked by policy: ${blocks.map((b) => b.id).join(", ")}`);
  }
  emit(caseId, {
    kind: "human",
    actor: "person",
    title: `You approved "${option.title}"`,
    detail: optionIndex !== plan.recommended ? `You chose a different option than the agent recommended.` : edits?.message ? "You edited the message." : undefined,
    important: true,
  });
  await execute(caseId, option, "person");
}

export function dismiss(caseId: string, reason: string) {
  const c = getCase(caseId);
  c.status = "DISMISSED";
  c.closedAt = demoNowIso();
  save();
  emit(caseId, { kind: "human", actor: "person", title: "You closed the case", detail: reason || "No reason given", important: true });
}

/* ---------------- demo controls ---------------- */

export async function advanceClock(days: number) {
  mutate((s) => {
    s.clockOffsetDays += days;
  });
  return sync();
}

export async function simulatePayment(invoiceId: string) {
  const sim = simulator();
  if (!sim) throw new Error("Payments are made in PayPal sandbox in this mode");
  sim.pay(invoiceId);
  return sync();
}

/**
 * Demo scenario: make one client's invoice overdue and play the whole case.
 * Autopilot approves the recommended option and, with the simulator, pays the invoice,
 * so every stage from overdue to PAID plays out on the case page.
 */
export async function runScenario(client: string, autopilot: boolean): Promise<string> {
  const s = db();
  const demo = DEMO_CLIENTS.find((d) => d.name === client);
  if (!demo) throw new Error(`Unknown scenario ${client}`);
  let inv = s.invoices.find((i) => i.clientName === client && !i.history && !i.replaces && outstanding(i) && !i.caseId);
  if (!inv) {
    const slug = client.toLowerCase().replace(/[^a-z]+/g, "");
    inv = await createInvoice({
      clientName: client,
      clientEmail: `billing@${slug}.example.com`,
      description: demo.description,
      amount: demo.amount,
      currency: "USD",
      dueInDays: demo.dueInDays,
    });
  }
  const today = isoDate(nowWith(s.clockOffsetDays));
  const jump = Math.max(1, daysBetween(today, inv.dueDate) + 2);
  mutate((st) => {
    st.clockOffsetDays += jump;
  });
  const autoMode = s.settings.autonomy;
  s.settings.autonomy = "always_ask"; // the scenario starts its own case below
  await sync();
  s.settings.autonomy = autoMode;
  save();
  const c = s.cases.find((x) => x.invoiceId === inv!.id);
  if (!c) throw new Error("The case did not open");
  background(playCase(c.id, autopilot));
  return c.id;
}

async function playCase(caseId: string, autopilot: boolean) {
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
  await pause(600); // let the page open before the agent starts
  if (!autopilot) {
    await startRun(caseId);
    return;
  }
  if (!(await lock(caseLock(caseId), CASE_LOCK_MS))) return;
  try {
    await startRun(caseId);
    running.add(caseId);
    markBusy(caseId, true);
    let c = getCase(caseId);
    if (c.status === "AWAITING_APPROVAL") {
      await pause(1800);
      emit(caseId, { kind: "human", actor: "person", title: "Demo autopilot approves the recommended option", detail: "In real use the owner reviews and approves here.", important: true });
      c = getCase(caseId);
      await approve(caseId, c.attempts[c.attempts.length - 1].plan!.recommended);
    }
    c = getCase(caseId);
    if (c.status === "WAITING_PAYMENT" && simulator()) {
      await pause(2500);
      for (const id of c.activeInvoiceIds) {
        const inv = db().invoices.find((i) => i.id === id);
        if (inv && inv.status !== "PAID") {
          emit(caseId, { kind: "human", actor: "client", title: `Client pays ${inv.number} (simulated)`, important: true });
          simulator()!.pay(id);
          await pause(900);
        }
      }
      await sync();
    }
  } catch (e) {
    emit(caseId, { kind: "error", actor: "code", title: "Autopilot stopped", detail: e instanceof Error ? e.message : String(e), important: true });
  } finally {
    running.delete(caseId);
    markBusy(caseId, false);
    await unlock(caseLock(caseId));
  }
}

export async function reset() {
  running.clear();
  await resetStore();
}

export function setAutonomy(mode: "always_ask" | "policy_based") {
  mutate((s) => {
    s.settings.autonomy = mode;
  });
}

export { setPhase };
