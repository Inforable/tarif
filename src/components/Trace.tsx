"use client";

import {
  AlertCircle,
  BadgeCheck,
  BookOpen,
  Brain,
  Cpu,
  Flag,
  Landmark,
  MessageSquare,
  Scale,
  Search,
  ShieldCheck,
  ShieldX,
  TriangleAlert,
  User,
} from "lucide-react";
import type { TraceEvent } from "@/lib/types";

const ICON = {
  signal: AlertCircle,
  phase: Flag,
  tool: Search,
  thought: MessageSquare,
  decision: Brain,
  validation: ShieldCheck,
  rejected: ShieldX,
  policy: Scale,
  paypal: Landmark,
  human: User,
  verify: BadgeCheck,
  learn: BookOpen,
  fallback: Cpu,
  error: TriangleAlert,
} as const;

const ACTOR = { agent: "Agent", code: "Code", paypal: "PayPal", person: "You", client: "Client" } as const;

function tone(e: TraceEvent) {
  if (e.kind === "rejected" || e.kind === "error" || (e.kind === "policy" && e.title.includes("blocked"))) return "tr-bad";
  if (e.kind === "verify" && e.title.includes("PAID")) return "tr-good";
  if (e.kind === "validation") return "tr-good";
  if (e.actor === "agent") return "tr-agent";
  if (e.actor === "paypal" || e.kind === "paypal") return "tr-paypal";
  if (e.actor === "person") return "tr-person";
  return "";
}

export function Trace({ events, running, everything }: { events: TraceEvent[]; running: boolean; everything: boolean }) {
  const shown = everything ? events : events.filter((e) => e.important || e.kind === "tool" || e.kind === "decision");
  if (!events.length) return <p className="text-[13px] muted py-6">The first steps will appear here when the agent starts.</p>;

  // Steps inside an agent run show seconds since the run started; everything else shows the clock time.
  const runStarts = events.filter((e) => e.kind === "phase" && e.title.startsWith("Agent started")).map((e) => e.at);
  const when = (at: number) => {
    const start = [...runStarts].reverse().find((s) => s <= at);
    if (start !== undefined && at - start < 10 * 60_000) return `+${((at - start) / 1000).toFixed(1)}s`;
    return new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  };
  return (
    <ol className="trace stagger">
      {shown.map((e, idx) => {
        const Icon = ICON[e.kind] ?? Flag;
        const divider = e.attempt > 1 && (idx === 0 || shown[idx - 1].attempt !== e.attempt);
        const data = e.data as { output?: unknown; input?: unknown; call_id?: string } | undefined;
        return (
          <li key={e.id} className="fade-in">
            {divider && (
              <div className="pl-10 pt-4 pb-1">
                <span className="tag">Attempt {e.attempt}</span>
              </div>
            )}
            <div className={`tr ${tone(e)}`}>
              <span className="tr-icon" aria-hidden="true">
                <Icon size={14} />
              </span>
              <div className="min-w-0">
                <div className="tr-meta">
                  <b>{ACTOR[e.actor]}</b>
                  <span className="num">{when(e.at)}</span>
                  {e.engine && <span className="tag">{e.engine === "rules" ? "rules" : e.engine}</span>}
                  {data?.call_id && <span className="tag">{data.call_id}</span>}
                </div>
                <div className="tr-title">{e.title}</div>
                {e.kind === "tool" && e.detail ? <div className="tr-why">{e.detail}</div> : e.detail ? <div className="tr-detail">{e.detail}</div> : null}
                {e.data !== undefined && e.kind !== "paypal" && (
                  <details className="tr-data">
                    <summary>{e.kind === "tool" ? "Show what the tool returned" : "Show raw data"}</summary>
                    <pre className="code">{JSON.stringify(e.kind === "tool" ? data?.output : e.data, null, 2)}</pre>
                  </details>
                )}
              </div>
            </div>
          </li>
        );
      })}
      {running && (
        <li className="thinking-row">
          <span className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          The agent is working
        </li>
      )}
    </ol>
  );
}
