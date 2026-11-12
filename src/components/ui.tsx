"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CaseStatus, InvoiceStatus } from "@/lib/types";

export async function api<T = unknown>(path: string, payload?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: payload === undefined ? "GET" : "POST",
    headers: payload === undefined ? undefined : { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || `Request failed (${res.status})`);
  return json as T;
}

/** Fetch JSON and keep it fresh. Polls fast while `isFast(data)` is true (agent running), slow otherwise. */
export function usePoll<T>(path: string, isFast?: (d: T | null) => boolean) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const alive = useRef(true);
  const fast = isFast ? isFast(data) : false;
  const load = useCallback(async () => {
    try {
      const d = await api<T>(path);
      if (alive.current) {
        setData(d);
        setError("");
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, [path]);
  useEffect(() => {
    alive.current = true;
    const first = setTimeout(load, 0);
    const t = setInterval(load, fast ? 700 : 4000);
    return () => {
      alive.current = false;
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load, fast]);
  return { data, error, reload: load };
}

export function money(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(n);
}

export function Money({ value, currency = "USD", className = "" }: { value: number; currency?: string; className?: string }) {
  return <span className={`num ${className}`}>{money(value, currency)}</span>;
}

/** Number that counts toward its new value (like a ticker). */
export function Ticker({ value, format = (n: number) => money(n) }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 650);
      const v = a + (value - a) * (1 - Math.pow(1 - k, 3));
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span>{format(shown)}</span>;
}

const CASE_BADGE: Record<CaseStatus, [string, string]> = {
  OPEN: ["badge-late", "Overdue"],
  RUNNING: ["badge-agent", "Agent working"],
  AWAITING_APPROVAL: ["badge-wait", "Needs your approval"],
  BLOCKED: ["badge-late", "Blocked by policy"],
  EXECUTING: ["badge-agent", "Sending to PayPal"],
  WAITING_PAYMENT: ["badge-info", "Waiting for payment"],
  PAID: ["badge-paid", "Paid"],
  ESCALATED: ["badge-late", "Escalated"],
  DISMISSED: ["", "Closed"],
  ERROR: ["badge-late", "Error"],
};

export function CaseBadge({ status, running }: { status: CaseStatus; running?: boolean }) {
  const [cls, label] = running ? CASE_BADGE.RUNNING : CASE_BADGE[status];
  return (
    <span className={`badge ${cls}`}>
      <i />
      {label}
    </span>
  );
}

export function InvoiceBadge({ status, overdue }: { status: InvoiceStatus; overdue?: number }) {
  if (status === "PAID" || status === "MARKED_AS_PAID")
    return (
      <span className="badge badge-paid">
        <i />
        Paid
      </span>
    );
  if (status === "CANCELLED") return <span className="badge">Replaced</span>;
  if (overdue && overdue > 0)
    return (
      <span className="badge badge-late">
        <i />
        {overdue}d overdue
      </span>
    );
  return (
    <span className="badge">
      <i />
      {status === "SENT" ? "Sent" : status.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}

export function ModeTags({ mode, engine }: { mode: string; engine: string }) {
  return (
    <span className="inline-flex gap-1.5">
      <span className={`tag ${mode === "sandbox" ? "tag-live" : "tag-sim"}`}>{mode === "sandbox" ? "PayPal sandbox" : "PayPal simulated"}</span>
      <span className={`tag ${engine === "rules" ? "tag-sim" : "tag-live"}`}>{engine === "rules" ? "Rule engine" : engine}</span>
    </span>
  );
}

export function useToast() {
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 3200);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <div className="toast fade-in" role="status">
      {msg}
    </div>
  ) : null;
  return { toast: setMsg, node };
}

export function Stat({ label, value, sub, icon, accent }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`stat ${accent ? "stat-accent" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="label">{label}</div>
        {icon && <span className="stat-icon">{icon}</span>}
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function SectionHead({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="section-head">
      <div className="min-w-0">
        <h2 className="section-title">{title}</h2>
        {sub && <p className="section-sub">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function Loading() {
  return (
    <div className="page animate-pulse">
      <div className="h-9 w-56 rounded bg-[var(--surface-2)]" />
      <div className="h-24 mt-6 rounded-[10px] bg-[var(--surface)]" />
      <div className="h-64 mt-6 rounded-[10px] bg-[var(--surface)]" />
    </div>
  );
}
