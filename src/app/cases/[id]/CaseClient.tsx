"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Check, CircleSlash, ExternalLink, Hand, Play } from "lucide-react";
import { Mark } from "@/components/Logo";
import { ModelPicker } from "@/components/ModelPicker";
import { Trace } from "@/components/Trace";
import { api, CaseBadge, InvoiceBadge, Loading, ModeTags, Money, money, usePoll, useToast } from "@/components/ui";
import { ACTION_LABEL } from "@/lib/library";
import type { PlanOption } from "@/lib/types";
import type { CaseView } from "@/lib/views";

const PHASES = ["Overdue", "Investigate", "Plan", "Policy", "PayPal", "Paid"];

const STORY = [
  "The invoice passed its due date in PayPal, so Tagih opened a case.",
  "The agent reads PayPal and the client's history. Every call carries its reason.",
  "The agent proposes options. Code checks every fact and number before policy sees it.",
  "Your policy decides: run on its own, ask you, or block.",
  "Code sends the approved action through the PayPal Invoicing API.",
  "Waiting for PayPal to report the money. Nothing closes on a promise.",
  "PayPal confirmed the payment. The playbook learned what worked.",
];

const REASON: Record<string, string> = {
  forgot: "Probably forgot",
  cash_flow: "Cash-flow pressure",
  unhappy_with_work: "Unhappy with the work",
  wrong_contact: "Invoice reached the wrong person",
  habitual_late_payer: "Habitual late payer",
  unknown: "Unclear",
};

const HEADLINE: Record<string, string> = {
  OPEN: "Ready for the agent",
  RUNNING: "The agent is working on this case",
  AWAITING_APPROVAL: "The agent has a plan. Your call.",
  BLOCKED: "Policy blocked the plan",
  EXECUTING: "Sending to PayPal",
  WAITING_PAYMENT: "Waiting for PayPal to confirm payment",
  PAID: "Paid. Case closed.",
  ESCALATED: "Escalated to you",
  DISMISSED: "You closed this case",
  ERROR: "Something went wrong",
};

type Act = (key: string, fn: () => Promise<unknown>, done?: string) => Promise<void>;

export default function CaseClient() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = usePoll<CaseView>(`/api/cases/${id}`, (d) => !d || d.running || d.case.status === "EXECUTING");
  const [everything, setEverything] = useState(false);
  const [tab, setTab] = useState<"decision" | "run" | null>(null);
  const [busy, setBusy] = useState("");
  const { toast, node } = useToast();

  const act: Act = async (key, fn, done) => {
    setBusy(key);
    try {
      await fn();
      if (done) toast(done);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      await reload();
      setBusy("");
    }
  };

  if (error && !data) return <p className="notice notice-bad mt-8">{error}</p>;
  if (!data) return <Loading />;

  const c = data.case;
  const inv = data.invoice;
  const live = data.running || c.status === "EXECUTING";
  const attempt = c.attempts[c.attempts.length - 1];
  const canRun = ["OPEN", "BLOCKED", "ERROR"].includes(c.status) && !data.running;
  const phase = c.status === "PAID" ? 6 : c.phase;

  const percent = [8, 30, 55, 75, 90, 96, 100][Math.min(6, phase)];
  const tabNow = tab ?? (data.running || !attempt?.plan ? "run" : "decision");

  return (
    <div className="page fade-in">
      <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] muted hover:text-[var(--ink)]">
        <ArrowLeft size={14} /> Receivables
      </Link>

      <section className="card proc-hero mt-3" data-running={live}>
        <div className="proc-mark" aria-hidden="true">
          <i />
          <i />
          <i />
          <span className="proc-mark-core">
            <Mark size={44} live={live} />
          </span>
        </div>
        <p className="eyebrow">
          <CaseBadge status={c.status} running={data.running} />
          <span className="num">
            {c.id}, attempt {c.attempts.length}
          </span>
        </p>
        <h1 className="proc-title">{data.running ? HEADLINE.RUNNING : HEADLINE[c.status]}</h1>
        <p className="proc-desc">
          <span className="text-[var(--ink)] font-medium">{inv.clientName}</span> owes{" "}
          <Money value={inv.amount} currency={inv.currency} className="text-[var(--ink)]" /> on <span className="num">{inv.number}</span>
          {inv.daysOverdue > 0 && c.status !== "PAID" && <span className="text-[var(--late)]">, {inv.daysOverdue} days overdue</span>}
        </p>

        <div className="glass">
          <div className="proc-label">
            <span>Progress by stage</span>
            <strong>
              {percent}
              <small className="text-[14px]">%</small>
            </strong>
          </div>
          <div className="proc-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Case progress">
            <span style={{ width: `${percent}%` }} />
          </div>
          <ol className="steps" aria-label="Case stages">
            {PHASES.map((p, i) => {
              const state = i < phase ? "done" : i === phase ? "current" : "next";
              return (
                <li key={p} data-state={state} aria-current={state === "current" ? "step" : undefined}>
                  <span>{state === "done" ? <Check size={12} /> : i + 1}</span>
                  {p}
                </li>
              );
            })}
          </ol>
        </div>
        <p className="story" key={`${phase}-${c.status}`}>
          {STORY[c.status === "PAID" ? 6 : phase]}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <ModeTags mode={data.mode} engine={attempt?.engine ?? data.engine} />
          {canRun && <ModelPicker compact onChange={() => reload()} />}
        </div>
        {canRun && (
          <button className="btn btn-accent w-full h-11 mt-3" disabled={!!busy} onClick={() => act("run", () => api(`/api/cases/${c.id}/run`, {}))}>
            <Play size={15} />
            {c.status === "OPEN" ? (c.attempts.length > 1 ? `Run attempt ${c.attempts.length}` : "Run agent") : "Run again"}
          </button>
        )}
      </section>

      <div className="segmented mt-4" role="tablist" aria-label="Case view">
        <button role="tab" aria-selected={tabNow === "decision"} onClick={() => setTab("decision")}>
          Decision
          {c.status === "AWAITING_APPROVAL" && <span className="count">1</span>}
        </button>
        <button role="tab" aria-selected={tabNow === "run"} onClick={() => setTab("run")}>
          Agent run <span className="count">{c.trace.filter((e) => e.kind === "tool").length}</span>
        </button>
      </div>

      <div className="stack mt-4">
        {tabNow === "decision" ? (
          <>
            {attempt?.plan ? (
              <Decision key={`${c.id}-${c.attempts.length}-${c.status}`} data={data} busy={busy} act={act} />
            ) : (
              <div className="panel pad text-[13px] muted">
                {data.running ? "The plan shows up here once the agent submits it and code validates it." : "No plan yet. Run the agent to start."}
              </div>
            )}
            <Payment data={data} busy={busy} act={act} />
            <Profile data={data} />
          </>
        ) : (
          <section className="card pad">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="section-title">Agent run</h2>
                <p className="section-sub">Every tool call and every check.</p>
              </div>
              <button className="btn btn-sm btn-ghost shrink-0" onClick={() => setEverything((v) => !v)}>
                {everything ? "Key steps" : `All ${c.trace.length}`}
              </button>
            </div>
            <div className="mt-3">
              <Trace events={c.trace} running={data.running} everything={everything} />
            </div>
          </section>
        )}
      </div>
      {node}
    </div>
  );
}

function Decision({ data, busy, act }: { data: CaseView; busy: string; act: Act }) {
  const c = data.case;
  const attempt = c.attempts[c.attempts.length - 1];
  const plan = attempt.plan!;
  const awaiting = c.status === "AWAITING_APPROVAL";
  const [sel, setSel] = useState(attempt.chosen ?? plan.recommended);
  const sent = attempt.executedAt && attempt.chosen !== undefined ? plan.options[attempt.chosen] : undefined;

  return (
    <>
      <section className={`card pad ${awaiting ? "action-card" : ""}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="label">{awaiting ? "Your decision" : "Plan"}</div>
          <span className="num text-[12px] muted">confidence {Math.round(plan.confidence * 100)}%</span>
        </div>
        <div className="mt-2 text-[17px] font-semibold">{REASON[plan.likelyReason]}</div>
        <p className="mt-1 text-[13.5px] text-[var(--ink-2)]">{plan.summary}</p>

        <div className="mt-4 flex flex-col gap-2" aria-label="Options">
          {plan.options.map((o, i) => (
            <button key={i} className="option" aria-pressed={i === sel} disabled={!awaiting} onClick={() => setSel(i)}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{o.title}</span>
                {i === plan.recommended && <span className="badge badge-agent shrink-0">Recommended</span>}
              </div>
              <div className="text-[12px] muted mt-1">
                {ACTION_LABEL[o.action]}
                {o.discountPct !== undefined && `, ${o.discountPct}% off`}
                {o.installments !== undefined && `, ${o.installments} payments`}
                {o.expectedPayRate !== undefined && `, paid ${Math.round(o.expectedPayRate * 100)}% of the time`}
              </div>
              <div className="text-[13px] text-[var(--ink-2)] mt-1.5">{o.rationale}</div>
            </button>
          ))}
        </div>

        {awaiting && <Editor key={sel} caseId={c.id} index={sel} option={plan.options[sel]} busy={busy} act={act} />}

        {sent && (
          <div className="notice mt-4">
            <div className="font-medium">
              Sent: {sent.title}
              <span className="muted font-normal"> ({attempt.decidedBy === "person" ? "approved by you" : "allowed by policy"})</span>
            </div>
            <p className="muted mt-1 whitespace-pre-wrap">{sent.message}</p>
          </div>
        )}
      </section>

      <section className="card pad">
        <div className="label">Evidence</div>
        <ul className="mt-3 flex flex-col gap-2.5">
          {plan.evidence.map((e, i) => (
            <li key={i} className="flex gap-2 text-[13px]">
              <span className={`tag shrink-0 ${e.kind === "fact" ? "tag-live" : "tag-sim"}`}>{e.kind}</span>
              <span className="text-[var(--ink-2)]">
                {e.claim}
                {e.kind === "fact" && <span className="num muted"> [{e.source}]</span>}
              </span>
            </li>
          ))}
        </ul>
        {plan.considered && (
          <details className="tr-data mt-3">
            <summary>Ruled out</summary>
            <p className="text-[13px] muted mt-2">{plan.considered}</p>
          </details>
        )}
      </section>

      {attempt.policy && (
        <section className="card pad">
          <div className="flex items-center justify-between">
            <div className="label">Autonomy boundary</div>
            <span className={`badge ${attempt.policy.verdict === "auto" ? "badge-paid" : attempt.policy.verdict === "blocked" ? "badge-late" : "badge-wait"}`}>
              {attempt.policy.verdict === "auto" ? "Runs on its own" : attempt.policy.verdict === "blocked" ? "Blocked" : "Needs a person"}
            </span>
          </div>
          <ul className="mt-2">
            {attempt.policy.checks.map((p) => (
              <li key={p.id} className="flex items-start gap-3 py-2 border-b last:border-b-0 text-[13px]">
                <span className="num w-[64px] shrink-0 muted text-[12px] pt-px">{p.id}</span>
                <span className="flex-1 min-w-0">
                  {p.rule}
                  <span className="block muted text-[12px]">{p.detail}</span>
                </span>
                <span className={`shrink-0 text-[12px] font-medium ${p.outcome === "pass" ? "text-[var(--paid)]" : p.outcome === "block" ? "text-[var(--late)]" : "text-[var(--wait)]"}`}>
                  {p.outcome === "pass" ? "ok" : p.outcome === "block" ? "blocks" : "asks you"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Editor({ caseId, index, option, busy, act }: { caseId: string; index: number; option: PlanOption; busy: string; act: Act }) {
  const [subject, setSubject] = useState(option.subject);
  const [message, setMessage] = useState(option.message);
  const [reason, setReason] = useState("");
  const call = option.action === "personal_call";
  return (
    <div className="mt-4 flex flex-col gap-2 fade-in">
      <label className="label" htmlFor="subj">
        {call ? "Task" : "Email subject (PayPal sends it)"}
      </label>
      <input id="subj" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <label className="label mt-1" htmlFor="msg">
        {call ? "Call script" : "Message the client reads"}
      </label>
      <textarea id="msg" className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} />
      <button
        className="btn btn-primary h-11 mt-1"
        disabled={!!busy || message.trim().length < 10}
        onClick={() => act("approve", () => api(`/api/cases/${caseId}/approve`, { option: index, subject, message }), call ? "Approved" : "Approved and sent through PayPal")}
      >
        <Check size={16} />
        {busy === "approve" ? "Sending" : call ? "Approve call task" : "Approve and send through PayPal"}
      </button>
      <div className="flex gap-2">
        <input className="input" placeholder="Reason to close (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className="btn shrink-0" disabled={!!busy} onClick={() => act("dismiss", () => api(`/api/cases/${caseId}/dismiss`, { reason }), "Case closed")}>
          <CircleSlash size={15} />
          Close
        </button>
      </div>
    </div>
  );
}

function Payment({ data, busy, act }: { data: CaseView; busy: string; act: Act }) {
  const c = data.case;
  const items = data.active.filter((i): i is NonNullable<typeof i> => Boolean(i));
  if (!items.length) return null;
  return (
    <section className="card pad">
      <div className="label">Owed now</div>
      <ul className="mt-3 flex flex-col gap-3">
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px] font-medium truncate">{i.description}</div>
              <div className="text-[12px] muted num">
                {i.number}, due {i.dueDate}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Money value={i.amount} currency={i.currency} />
              <InvoiceBadge status={i.status} />
            </div>
          </li>
        ))}
      </ul>
      {c.status === "WAITING_PAYMENT" && (
        <div className="mt-4 flex flex-col gap-2">
          {items
            .filter((i) => i.status !== "PAID")
            .map((i) =>
              data.mode === "simulated" ? (
                <button
                  key={i.id}
                  className="btn"
                  disabled={!!busy}
                  onClick={() => act("pay", () => api("/api/demo", { action: "pay", invoiceId: i.id }), `${i.clientName} paid ${money(i.amount, i.currency)}`)}
                >
                  <Hand size={15} />
                  Client pays {i.number} (simulated)
                </button>
              ) : (
                i.payUrl && (
                  <a key={i.id} className="btn" href={i.payUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={15} />
                    Pay {i.number} in PayPal sandbox
                  </a>
                )
              ),
            )}
          <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => act("sync", () => api("/api/sync", {}), "Checked PayPal")}>
            Check PayPal for payment
          </button>
        </div>
      )}
    </section>
  );
}

function Profile({ data }: { data: CaseView }) {
  const p = data.profile;
  return (
    <section className="panel pad">
      <div className="label">Client profile, computed by code</div>
      <div className="mt-2 font-medium">{p.client}</div>
      <dl className="mt-3 grid grid-cols-2 gap-y-2 text-[13px]">
        <dt className="muted">Segment</dt>
        <dd className="num">{p.segment.replace("_", " ")}</dd>
        <dt className="muted">Paid invoices</dt>
        <dd className="num">
          {p.paid} of {p.invoices}
        </dd>
        <dt className="muted">Average days late</dt>
        <dd className="num">{p.avgDaysLate ?? "none"}</dd>
        <dt className="muted">Reminders usually needed</dt>
        <dd className="num">{p.avgReminders ?? "none"}</dd>
      </dl>
      <p className="text-[12px] muted mt-3">{p.segmentRule}. History before Tagih is synthetic seed data.</p>
    </section>
  );
}
