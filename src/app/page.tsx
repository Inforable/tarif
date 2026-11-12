"use client";

import Link from "next/link";
import { useState } from "react";
import { AlarmClock, CircleCheck, ChevronRight, Play, RefreshCw, UserCheck, Wallet } from "lucide-react";
import { api, CaseBadge, InvoiceBadge, Loading, ModeTags, Money, money, PageHead, SectionHead, Stat, Ticker, usePoll, useToast } from "@/components/ui";
import type { OverviewView } from "@/lib/views";

export default function Overview() {
  const [busy, setBusy] = useState("");
  const { toast, node } = useToast();
  const { data, error, reload } = usePoll<OverviewView>("/api/state", (d) => d?.cases.some((c) => c.running || c.status === "EXECUTING") ?? false);

  async function act(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    try {
      await fn();
      if (done) toast(done);
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  if (error && !data) return <p className="notice notice-bad mt-8">{error}</p>;
  if (!data) return <Loading />;

  const s = data.stats;
  const openCases = data.cases.filter((c) => c.status === "OPEN");
  const needsYou = data.cases.filter((c) => c.status === "AWAITING_APPROVAL");
  const auto = data.settings.autonomy === "policy_based";

  return (
    <div className="page fade-in">
      <PageHead title="Receivables" sub="Overdue PayPal invoices become cases. The agent plans, your policy decides, PayPal executes, and a case closes only when PayPal says the money arrived.">
        <ModeTags mode={data.mode} engine={data.engine} />
      </PageHead>

      <div className="mt-5 flex flex-wrap items-center gap-2 text-[13px]">
        <span className="muted">
          Today <span className="num text-[var(--ink)]">{data.today}</span>
          {data.offset > 0 && <span className="num"> (demo clock +{data.offset}d)</span>}
        </span>
        <button className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => act("sync", () => api("/api/sync", {}), "Synced with PayPal")}>
          <RefreshCw size={13} className={busy === "sync" ? "animate-spin" : ""} />
          Sync PayPal
        </button>
      </div>

      <div className="stats mt-4 stagger">
        <Stat label="Outstanding" icon={<Wallet size={14} />} value={<Ticker value={s.outstanding} />} sub="Open in PayPal" />
        <Stat label="Overdue" icon={<AlarmClock size={14} />} value={<Ticker value={s.overdue} />} sub={`${s.overdueCount} past due`} />
        <Stat label="Collected" icon={<CircleCheck size={14} />} accent value={<Ticker value={s.collected} />} sub="Confirmed PAID by PayPal" />
        <Stat label="Needs you" icon={<UserCheck size={14} />} value={<Ticker value={s.awaiting} format={(n) => String(Math.round(n))} />} sub={`${s.autoDecisions} by policy, ${s.personDecisions} by you`} />
      </div>

      <div className="card mt-4 pad flex items-start gap-3">
        <button
          className="switch mt-0.5"
          role="switch"
          aria-checked={auto}
          aria-label="Let the agent act on its own when policy allows"
          disabled={!!busy}
          onClick={() =>
            act("auto", () => api("/api/settings", { autonomy: auto ? "always_ask" : "policy_based" }), auto ? "Every action now waits for you" : "Agent may act when no rule holds it")
          }
        />
        <div className="min-w-0">
          <div className="font-medium">Agent autonomy {auto ? "on" : "off"}</div>
          <div className="text-[13px] muted">
            {auto
              ? `Plain reminders up to ${data.settings.approvalThreshold} USD go out on their own. Discounts, installments, low confidence and escalations still wait for you.`
              : "The agent investigates and plans. Every PayPal action waits for your approval."}
          </div>
        </div>
      </div>

      {data.invoices.length === 0 ? (
        <Empty busy={!!busy} onDemo={() => act("demo", () => api("/api/demo", { action: "invoices" }), "4 invoices sent through PayPal")} />
      ) : (
        <>
          {needsYou.length > 0 && (
            <Link href={`/cases/${needsYou[0].id}`} className="card action-card mt-4 pad flex items-center justify-between gap-3 fade-in">
              <div className="min-w-0">
                <div className="font-semibold">
                  {needsYou.length} plan{needsYou.length > 1 ? "s" : ""} waiting for your approval
                </div>
                <div className="text-[13px] muted truncate">
                  Next: {needsYou[0].client}, {needsYou[0].action}
                </div>
              </div>
              <span className="btn btn-primary btn-sm shrink-0">
                Review <ChevronRight size={14} />
              </span>
            </Link>
          )}

          <div className="dash-grid section">
          <section>
            <SectionHead title="Collection cases" sub="One per overdue invoice. Open one to watch the agent work.">
              {openCases.length > 0 && (
                <button
                  className="btn btn-accent btn-sm shrink-0"
                  disabled={!!busy}
                  onClick={() =>
                    act("runall", async () => {
                      for (const c of openCases) await api(`/api/cases/${c.id}/run`, {});
                    }, `Agent started on ${openCases.length} case(s)`)
                  }
                >
                  <Play size={13} />
                  Run agent ({openCases.length})
                </button>
              )}
            </SectionHead>
            {data.cases.length === 0 ? (
              <div className="card pad text-[13px] muted">
                Nothing overdue yet. Invoices are due in the future; move the clock forward in{" "}
                <Link href="/demo" className="underline underline-offset-2">
                  Demo control
                </Link>
                .
              </div>
            ) : (
              <div className="rows stagger">
                {data.cases.map((c) => (
                  <Link key={c.id} href={`/cases/${c.id}`} className="row">
                    <div className="row-main">
                      <div className="row-title">{c.client}</div>
                      <div className="row-sub">
                        <span className="num">{c.number}</span>, {c.daysOverdue} days overdue
                        {c.action ? `, ${c.action}` : ""}
                        {c.attempt > 1 ? `, attempt ${c.attempt}` : ""}
                      </div>
                    </div>
                    <div className="row-side">
                      <Money value={c.amount} currency={c.currency} className="font-medium" />
                      <CaseBadge status={c.status} running={c.running} />
                    </div>
                    {c.status === "OPEN" && !c.running && (
                      <button
                        className="btn btn-sm btn-accent row-run col-span-2 justify-self-start"
                        disabled={!!busy}
                        onClick={(e) => {
                          e.preventDefault();
                          act(`run-${c.id}`, () => api(`/api/cases/${c.id}/run`, {}), `Agent started on ${c.client}`);
                        }}
                      >
                        <Play size={13} /> Run agent
                      </button>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>

          <aside className="stack">
            <section className="card pad">
              <div className="flex items-center justify-between">
                <h2 className="section-title">Agent activity</h2>
                {data.cases.some((c) => c.running) && <span className="badge badge-agent">live</span>}
              </div>
              {data.activity.length === 0 ? (
                <p className="text-[13px] muted mt-2">Steps from every case show up here as the agent works.</p>
              ) : (
                <ul className="feed mt-2 stagger">
                  {data.activity.map((a, i) => (
                    <li key={`${a.caseId}-${a.at}-${i}`} className={i === 0 ? "fade-in" : ""}>
                      <span
                        className={`dot ${a.kind === "rejected" || a.kind === "error" ? "dot-bad" : a.kind === "verify" && a.title.includes("PAID") ? "dot-good" : a.actor === "agent" ? "dot-agent" : a.actor === "paypal" || a.kind === "paypal" ? "dot-paypal" : a.actor === "person" ? "dot-person" : ""}`}
                      />
                      <Link href={`/cases/${a.caseId}`} className="min-w-0 hover:underline underline-offset-2">
                        <span className="block truncate">{a.title}</span>
                        <span className="block text-[12px] muted truncate">
                          {a.client}
                          {a.engine ? `, ${a.engine}` : ""}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card pad">
              <h2 className="section-title">Receivables aging</h2>
              <div className="aging mt-3">
                {data.aging.map((b, i) => {
                  const max = Math.max(1, ...data.aging.map((x) => x.amount));
                  return (
                    <div key={b.label}>
                      <div className="flex justify-between text-[12.5px]">
                        <span className="muted">{b.label}</span>
                        <span className="num">
                          {money(b.amount)} <span className="muted">({b.count})</span>
                        </span>
                      </div>
                      <div className="aging-bar mt-1">
                        <span style={{ width: `${(b.amount / max) * 100}%`, background: i === 0 ? "var(--ink)" : i === 1 ? "var(--wait)" : "var(--late)" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </aside>
          </div>

          <section className="section">
            <SectionHead title="Invoices in PayPal" sub="Live status from the PayPal Invoicing API." />
            <div className="rows stagger">
              {data.invoices.map((i) => (
                <div key={i.id} className="row">
                  <div className="row-main">
                    <div className="row-title">{i.clientName}</div>
                    <div className="row-sub">
                      <span className="num">{i.number}</span>, due <span className="num">{i.dueDate}</span>, {i.description}
                    </div>
                    {i.payUrl && !["PAID", "CANCELLED", "MARKED_AS_PAID"].includes(i.status) && (
                      <a href={i.payUrl} target="_blank" rel="noreferrer" className="text-[12.5px] underline underline-offset-2">
                        Open client view
                      </a>
                    )}
                  </div>
                  <div className="row-side">
                    <Money value={i.amount} currency={i.currency} className="font-medium" />
                    <InvoiceBadge status={i.status} overdue={i.daysOverdue} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      {node}
    </div>
  );
}

function Empty({ busy, onDemo }: { busy: boolean; onDemo: () => void }) {
  return (
    <div className="card mt-6 pad text-center py-10">
      <div className="page-title text-[26px]">No invoices yet</div>
      <p className="muted mt-2 max-w-[440px] mx-auto text-[14px]">
        Send four demo invoices through PayPal for clients with different payment habits, or turn a chat with a client into an invoice.
      </p>
      <div className="flex flex-col justify-center gap-2 mt-6">
        <button className="btn btn-primary" disabled={busy} onClick={onDemo}>
          Send 4 demo invoices
        </button>
        <Link href="/new" className="btn">
          Invoice from a chat
        </Link>
      </div>
    </div>
  );
}
