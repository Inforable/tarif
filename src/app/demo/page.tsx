"use client";

import Link from "next/link";
import { useState } from "react";
import { Clock, FastForward, Play, RotateCcw, Send } from "lucide-react";
import { api, Loading, ModeTags, PageHead, usePoll, useToast } from "@/components/ui";
import type { OverviewView } from "@/lib/views";

export default function Demo() {
  const { data, reload } = usePoll<OverviewView>("/api/state");
  const [busy, setBusy] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const { toast, node } = useToast();

  async function act(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      const r = (await fn()) as { opened?: string[]; paid?: string[]; reopened?: string[] } | undefined;
      const extra = r && (r.opened?.length || r.paid?.length || r.reopened?.length)
        ? ` (${[r.opened?.length && `${r.opened.length} case(s) opened`, r.paid?.length && `${r.paid.length} paid`, r.reopened?.length && `${r.reopened.length} reopened`].filter(Boolean).join(", ")})`
        : "";
      toast(done + extra);
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  if (!data) return <Loading />;
  const hasInvoices = data.invoices.length > 0;
  const open = data.cases.filter((c) => c.status === "OPEN");
  const awaiting = data.cases.find((c) => c.status === "AWAITING_APPROVAL");
  const waiting = data.cases.find((c) => c.status === "WAITING_PAYMENT");

  const steps: Array<{ title: string; body: string; action?: React.ReactNode; done: boolean }> = [
    {
      title: "Send invoices through PayPal",
      body: "Four clients with different payment habits: reliable, cash-flow trouble, always two weeks late, brand new.",
      done: hasInvoices,
      action: (
        <button className="btn btn-sm btn-primary" disabled={!!busy || hasInvoices} onClick={() => act("inv", () => api("/api/demo", { action: "invoices" }), "Invoices sent")}>
          <Send size={14} /> Send 4 invoices
        </button>
      ),
    },
    {
      title: "Move the clock 7 days",
      body: "Every invoice passes its due date. The overdue signal opens one case per invoice.",
      done: data.cases.length > 0,
      action: (
        <button className="btn btn-sm" disabled={!!busy || !hasInvoices} onClick={() => act("adv7", () => api("/api/demo", { action: "advance", days: 7 }), "Clock moved 7 days")}>
          <FastForward size={14} /> +7 days
        </button>
      ),
    },
    {
      title: "Run the agent",
      body: "Open a case to watch it live, or start all open cases at once.",
      done: data.cases.some((c) => c.status !== "OPEN"),
      action: (
        <div className="flex gap-2">
          {open[0] && (
            <Link className="btn btn-sm" href={`/cases/${open[0].id}`}>
              Watch {open[0].client}
            </Link>
          )}
          <button
            className="btn btn-sm btn-accent"
            disabled={!!busy || !open.length}
            onClick={() =>
              act("run", async () => {
                for (const c of open) await api(`/api/cases/${c.id}/run`, {});
              }, "Agent started")
            }
          >
            <Play size={14} /> Run all ({open.length})
          </button>
        </div>
      ),
    },
    {
      title: "Approve a plan",
      body: "Policy holds money-changing actions, large amounts and low confidence. Pick an option, edit the message, approve.",
      done: data.cases.some((c) => ["WAITING_PAYMENT", "PAID"].includes(c.status)),
      action: awaiting ? (
        <Link className="btn btn-sm" href={`/cases/${awaiting.id}`}>
          Review {awaiting.client}
        </Link>
      ) : undefined,
    },
    {
      title: "The client pays",
      body:
        data.mode === "sandbox"
          ? "Open the case, click Pay in PayPal sandbox, log in with your sandbox buyer account and pay. Then Check PayPal for payment."
          : "Open the case and press Client pays (simulated). The verifier closes the case only after the payment is recorded.",
      done: data.cases.some((c) => c.status === "PAID"),
      action: waiting ? (
        <Link className="btn btn-sm" href={`/cases/${waiting.id}`}>
          Open {waiting.client}
        </Link>
      ) : undefined,
    },
    {
      title: "Let a payment window run out",
      body: `Unpaid cases reopen after ${data.settings.paymentWindowDays} days and the agent plans again, knowing what failed. Three failures escalate to you.`,
      done: data.cases.some((c) => c.attempt > 1),
      action: (
        <button
          className="btn btn-sm"
          disabled={!!busy || !hasInvoices}
          onClick={() => act("adv5", () => api("/api/demo", { action: "advance", days: data.settings.paymentWindowDays }), `Clock moved ${data.settings.paymentWindowDays} days`)}
        >
          <FastForward size={14} /> +{data.settings.paymentWindowDays} days
        </button>
      ),
    },
    {
      title: "Give the agent autonomy",
      body: "Switch on policy-based autonomy on Receivables. Small plain reminders now go out without you; everything else still waits.",
      done: data.settings.autonomy === "policy_based",
      action: (
        <button
          className="btn btn-sm"
          disabled={!!busy}
          onClick={() =>
            act("auto", () => api("/api/settings", { autonomy: data.settings.autonomy === "policy_based" ? "always_ask" : "policy_based" }), "Autonomy changed")
          }
        >
          {data.settings.autonomy === "policy_based" ? "Turn off" : "Turn on"}
        </button>
      ),
    },
  ];

  return (
    <div className="page fade-in max-w-[960px]">
      <PageHead title="Demo control" sub="Run the whole story in a few minutes. Collections take days, so the demo clock moves time. PayPal calls stay real in sandbox mode.">
        <ModeTags mode={data.mode} engine={data.engine} />
      </PageHead>

      <section className="card mt-6">
        <ol>
          {steps.map((s, i) => (
            <li key={s.title} className="flex flex-wrap items-center gap-3 px-4 py-4 border-b last:border-b-0">
              <span
                className={`num w-7 h-7 rounded-full grid place-items-center text-[12px] shrink-0 ${s.done ? "bg-[var(--ink)] text-[var(--bg)]" : "border border-[var(--line-strong)]"}`}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-[220px]">
                <div className="font-medium">{s.title}</div>
                <div className="text-[13px] muted">{s.body}</div>
              </div>
              {s.action}
            </li>
          ))}
        </ol>
      </section>

      <div className="flex flex-col gap-4 mt-4">
        <section className="card pad">
          <div className="label flex items-center gap-2">
            <Clock size={13} /> Demo clock
          </div>
          <div className="display text-[30px] mt-2 num">{data.today}</div>
          <div className="text-[13px] muted">{data.offset ? `${data.offset} days ahead of the real date` : "Same as the real date"}</div>
          <div className="flex gap-2 mt-4">
            {[1, 3, 7].map((d) => (
              <button key={d} className="btn btn-sm" disabled={!!busy} onClick={() => act(`a${d}`, () => api("/api/demo", { action: "advance", days: d }), `Clock moved ${d} day(s)`)}>
                +{d} day{d > 1 ? "s" : ""}
              </button>
            ))}
          </div>
        </section>

        <Limits
          key={`${data.settings.approvalThreshold}-${data.settings.maxDiscountPct}-${data.settings.paymentWindowDays}`}
          initial={{ approvalThreshold: data.settings.approvalThreshold, maxDiscountPct: data.settings.maxDiscountPct, paymentWindowDays: data.settings.paymentWindowDays }}
          busy={!!busy}
          onSave={(l) => act("lim", () => api("/api/settings", l), "Policy limits saved")}
        />
      </div>

      <section className="panel pad mt-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-medium">Reset the demo</div>
          <div className="text-[13px] muted">Clears cases, invoices and the clock in this app. Invoices already in your PayPal sandbox stay there.</div>
        </div>
        {confirmReset ? (
          <div className="flex gap-2">
            <button className="btn btn-sm" onClick={() => setConfirmReset(false)}>
              Keep
            </button>
            <button
              className="btn btn-sm btn-primary"
              disabled={!!busy}
              onClick={() => {
                setConfirmReset(false);
                act("reset", () => api("/api/demo", { action: "reset" }), "Demo reset");
              }}
            >
              Yes, reset
            </button>
          </div>
        ) : (
          <button className="btn btn-sm" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={14} /> Reset
          </button>
        )}
      </section>
      {node}
    </div>
  );
}

type LimitsT = { approvalThreshold: number; maxDiscountPct: number; paymentWindowDays: number };

function Limits({ initial, busy, onSave }: { initial: LimitsT; busy: boolean; onSave: (l: LimitsT) => void }) {
  const [limits, setLimits] = useState(initial);
  const field = (k: keyof LimitsT, label: string) => (
    <label className="flex flex-col gap-1 text-[12px] muted">
      {label}
      <input className="input num" inputMode="numeric" value={limits[k]} onChange={(e) => setLimits({ ...limits, [k]: Number(e.target.value) || 0 })} />
    </label>
  );
  return (
    <section className="card pad">
      <div className="label">Policy limits</div>
      <div className="grid grid-cols-3 gap-3 mt-3">
        {field("approvalThreshold", "Approval above USD")}
        {field("maxDiscountPct", "Max discount %")}
        {field("paymentWindowDays", "Wait days")}
      </div>
      <button className="btn btn-sm mt-4" disabled={busy} onClick={() => onSave(limits)}>
        Save limits
      </button>
    </section>
  );
}
