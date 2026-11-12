"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Clock, FastForward, Play, RotateCcw } from "lucide-react";
import { api, Loading, ModeTags, money, PageHead, usePoll, useToast } from "@/components/ui";
import type { OverviewView } from "@/lib/views";

const SCENARIOS = [
  { client: "Kopi Lereng", title: "Cash-flow trouble", body: "Paid late twice, once asked to split. Expect installments.", amount: 1250 },
  { client: "Studio Rimba", title: "Reliable, just forgot", body: "Pays after one reminder. Expect a friendly nudge.", amount: 420 },
  { client: "Nusa Travel", title: "Always two weeks late", body: "Consistent delay. Expect a firm reminder with a date.", amount: 640 },
  { client: "Arka Digital", title: "Brand new client", body: "No history. Expect low confidence and your review.", amount: 300 },
];

function readAutopilot() {
  try {
    return localStorage.getItem("tagih:autopilot") !== "off";
  } catch {
    return true;
  }
}

export default function Demo() {
  const router = useRouter();
  const { data, reload } = usePoll<OverviewView>("/api/state");
  const [busy, setBusy] = useState("");
  const [autopilot, setAutopilot] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const { toast, node } = useToast();

  useEffect(() => {
    const t = setTimeout(() => setAutopilot(readAutopilot()), 0);
    return () => clearTimeout(t);
  }, []);

  async function play(client: string) {
    if (busy) return;
    setBusy(client);
    try {
      const r = await api<{ caseId: string }>("/api/demo", { action: "scenario", client, autopilot });
      router.push(`/cases/${r.caseId}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
      setBusy("");
    }
  }

  async function act(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await fn();
      toast(done);
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || /input|textarea|select/i.test((e.target as HTMLElement).tagName)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= SCENARIOS.length) play(SCENARIOS[n - 1].client);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!data) return <Loading />;

  return (
    <div className="page fade-in">
      <PageHead title="Demo control" sub="Pick a scenario and watch it run end to end.">
        <ModeTags mode={data.mode} engine={data.engine} />
      </PageHead>

      <div className="card pad mt-5 flex items-start gap-3">
        <button
          className="switch mt-0.5"
          role="switch"
          aria-checked={autopilot}
          aria-label="Autopilot"
          onClick={() => {
            const next = !autopilot;
            setAutopilot(next);
            try {
              localStorage.setItem("tagih:autopilot", next ? "on" : "off");
            } catch {}
          }}
        />
        <div>
          <div className="font-medium">Autopilot {autopilot ? "on" : "off"}</div>
          <div className="text-[13px] muted">
            {autopilot
              ? data.mode === "simulated"
                ? "Approves the recommendation and the client pays. Overdue to Paid, hands free."
                : "Approves the recommendation. You pay as the sandbox buyer."
              : "The agent stops at your approval."}
          </div>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Scenarios</h2>
          <span className="text-[12px] muted">
            Keys <span className="kbd">1</span> to <span className="kbd">4</span>
          </span>
        </div>
        <div className="rows stagger">
          {SCENARIOS.map((s, i) => (
            <button key={s.client} className="row w-full text-left cursor-pointer hover:bg-[var(--surface)]" disabled={!!busy} onClick={() => play(s.client)}>
              <div className="row-main">
                <div className="row-title">
                  <span className="kbd mr-2">{i + 1}</span>
                  {s.title}
                </div>
                <div className="row-sub">
                  {s.client}, {money(s.amount)}. {s.body}
                </div>
              </div>
              <div className="row-side justify-center">
                <span className={`btn btn-sm ${busy === s.client ? "btn-primary" : "btn-accent"}`}>
                  <Play size={13} />
                  {busy === s.client ? "Starting" : "Play"}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="card pad mt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="label flex items-center gap-2">
              <Clock size={13} /> Demo clock
            </div>
            <div className="page-title text-[24px] mt-1 num">{data.today}</div>
          </div>
          <div className="flex gap-2">
            {[1, 5].map((d) => (
              <button key={d} className="btn btn-sm" disabled={!!busy} onClick={() => act(`a${d}`, () => api("/api/demo", { action: "advance", days: d }), `Clock moved ${d} day${d > 1 ? "s" : ""}`)}>
                <FastForward size={13} />+{d}d
              </button>
            ))}
          </div>
        </div>
        <p className="text-[12.5px] muted mt-2">+5 days lets a payment window run out, so unpaid cases reopen and escalate.</p>
      </section>

      <Limits
        key={`${data.settings.approvalThreshold}-${data.settings.maxDiscountPct}-${data.settings.paymentWindowDays}`}
        initial={{ approvalThreshold: data.settings.approvalThreshold, maxDiscountPct: data.settings.maxDiscountPct, paymentWindowDays: data.settings.paymentWindowDays }}
        busy={!!busy}
        onSave={(l) => act("lim", () => api("/api/settings", l), "Policy limits saved")}
      />

      <section className="panel pad mt-4 flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">Reset</div>
          <div className="text-[12.5px] muted">Clears this app. PayPal sandbox keeps its invoices.</div>
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
              Reset
            </button>
          </div>
        ) : (
          <button className="btn btn-sm" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={13} /> Reset
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
    <section className="card pad mt-4">
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
