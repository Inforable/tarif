import { engineName, isRunning } from "./cases";
import { daysBetween, isoDate, nowWith } from "./clock";
import { outstanding, payRate, profileFor } from "./clients";
import { ACTION_LABEL } from "./library";
import { paypal } from "./paypal";
import { db } from "./store";

// JSON views for the UI. Kept in one place so pages stay presentational.

export function overviewView() {
  const s = db();
  const today = isoDate(nowWith(s.clockOffsetDays));
  const live = s.invoices.filter((i) => !i.history);
  const invoices = live
    .map((i) => {
      const c = s.cases.find((x) => x.id === i.caseId);
      return {
        ...i,
        daysOverdue: outstanding(i) ? Math.max(0, daysBetween(i.dueDate, today)) : 0,
        caseStatus: c?.status ?? null,
        running: c ? isRunning(c.id) : false,
      };
    })
    .sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));
  const open = live.filter(outstanding);
  const overdue = open.filter((i) => daysBetween(i.dueDate, today) > 0);
  const collected = s.cases
    .filter((c) => c.status === "PAID")
    .reduce((sum, c) => sum + c.activeInvoiceIds.reduce((a, id) => a + (s.invoices.find((i) => i.id === id)?.amount ?? 0), 0), 0);
  const cases = s.cases.map((c) => {
    const inv = s.invoices.find((i) => i.id === c.invoiceId)!;
    const a = c.attempts[c.attempts.length - 1];
    const opt = a?.plan && a.chosen !== undefined ? a.plan.options[a.chosen] : undefined;
    return {
      id: c.id,
      status: c.status,
      running: isRunning(c.id),
      attempt: c.attempts.length,
      client: inv.clientName,
      number: inv.number,
      amount: inv.amount,
      currency: inv.currency,
      daysOverdue: Math.max(0, daysBetween(inv.dueDate, today)),
      action: opt ? ACTION_LABEL[opt.action] : null,
      engine: a?.engine ?? null,
    };
  });
  const activity = s.cases
    .flatMap((c) => {
      const client = s.invoices.find((i) => i.id === c.invoiceId)?.clientName ?? "";
      return c.trace.map((e) => ({ caseId: c.id, client, at: e.at, kind: e.kind, actor: e.actor, title: e.title, engine: e.engine }));
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, 9);
  const aging = [
    { label: "Not due", min: -9999, max: 0 },
    { label: "1-7 days", min: 1, max: 7 },
    { label: "8-14 days", min: 8, max: 14 },
    { label: "15+ days", min: 15, max: 9999 },
  ].map((b) => {
    const inB = open.filter((i) => {
      const d = daysBetween(i.dueDate, today);
      return d >= b.min && d <= b.max;
    });
    return { label: b.label, amount: inB.reduce((a, i) => a + i.amount, 0), count: inB.length };
  });
  const playbook = s.playbook
    .map((p) => ({ ...p, label: ACTION_LABEL[p.action], payRate: payRate(p) }))
    .sort((a, b) => a.segment.localeCompare(b.segment) || b.payRate - a.payRate);

  return {
    mode: paypal().mode,
    engine: engineName(),
    today,
    offset: s.clockOffsetDays,
    settings: s.settings,
    stats: {
      outstanding: open.reduce((a, i) => a + i.amount, 0),
      overdue: overdue.reduce((a, i) => a + i.amount, 0),
      overdueCount: overdue.length,
      collected,
      awaiting: s.cases.filter((c) => c.status === "AWAITING_APPROVAL").length,
      openCases: s.cases.filter((c) => !["PAID", "DISMISSED"].includes(c.status)).length,
      autoDecisions: s.cases.flatMap((c) => c.attempts).filter((a) => a.decidedBy === "agent").length,
      personDecisions: s.cases.flatMap((c) => c.attempts).filter((a) => a.decidedBy === "person").length,
    },
    invoices,
    cases,
    playbook,
    activity,
    aging,
  };
}

export function caseView(id: string) {
  const s = db();
  const c = s.cases.find((x) => x.id === id);
  if (!c) return null;
  const inv = s.invoices.find((i) => i.id === c.invoiceId)!;
  const today = isoDate(nowWith(s.clockOffsetDays));
  return {
    mode: paypal().mode,
    engine: engineName(),
    today,
    settings: s.settings,
    running: isRunning(c.id),
    case: c,
    invoice: { ...inv, daysOverdue: Math.max(0, daysBetween(inv.dueDate, today)) },
    active: c.activeInvoiceIds.map((x) => s.invoices.find((i) => i.id === x)).filter(Boolean),
    profile: profileFor(s, inv.clientName, inv.id),
  };
}

export type OverviewView = ReturnType<typeof overviewView>;
export type CaseView = NonNullable<ReturnType<typeof caseView>>;
