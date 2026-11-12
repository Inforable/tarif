"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { api, Money, usePoll } from "@/components/ui";
import type { OverviewView } from "@/lib/views";

// Client-side view of an invoice in simulator mode. In sandbox mode clients pay on PayPal itself.

export default function PayClient() {
  const { id } = useParams<{ id: string }>();
  const { data, reload } = usePoll<OverviewView>("/api/state");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inv = data?.invoices.find((i) => i.id === id);

  if (!data) return <div className="pt-8 animate-pulse h-72 rounded bg-[var(--surface)] mt-8 max-w-[440px] mx-auto" />;
  if (!inv) return <p className="notice mt-10 max-w-[440px] mx-auto">Invoice not found.</p>;
  const paid = inv.status === "PAID" || inv.status === "MARKED_AS_PAID";

  return (
    <div className="pt-12 fade-in max-w-[440px] mx-auto">
      <div className="card p-7">
        <div className="flex items-center justify-between">
          <div className="label">Invoice {inv.number}</div>
          <span className="tag tag-sim">PayPal simulated</span>
        </div>
        <div className="mt-5 text-[13px] muted">From {data.settings.businessName} to</div>
        <div className="font-medium">{inv.clientName}</div>
        <div className="mt-5 text-[13px] text-[var(--ink-2)]">{inv.description}</div>
        <div className="hr my-5" />
        <div className="flex items-end justify-between">
          <span className="muted text-[13px]">Due {inv.dueDate}</span>
          <Money value={inv.amount} currency={inv.currency} className="display text-[34px]" />
        </div>
        {paid ? (
          <div className="notice mt-6 text-center">Paid. Thank you.</div>
        ) : inv.status === "CANCELLED" ? (
          <div className="notice mt-6 text-center">This invoice was replaced by an updated one.</div>
        ) : (
          <button
            className="btn btn-primary w-full mt-6 h-11"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr("");
              try {
                await api("/api/demo", { action: "pay", invoiceId: inv.id });
                await reload();
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Paying" : "Pay with PayPal"}
          </button>
        )}
        {err && <p className="notice notice-bad mt-3">{err}</p>}
      </div>
      <p className="text-[12px] muted text-center mt-4">Simulator page. With sandbox credentials, clients pay on PayPal itself.</p>
    </div>
  );
}
