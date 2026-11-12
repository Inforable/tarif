"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { api, money, useToast } from "@/components/ui";

const SAMPLE = `Warung Senja (Dimas): Hi Raka, the new menu illustrations look great, the team loves them.
Me: Glad to hear that! As agreed it's 780 USD for the 6 illustrations. I'll send the invoice today.
Warung Senja (Dimas): Perfect. Please send it to finance@warungsenja.com, we usually pay within 14 days.`;

interface Draft {
  clientName: string;
  clientEmail: string;
  description: string;
  amount: number | null;
  currency: string;
  dueInDays: number | null;
  note: string;
  missing: string[];
  engine: string;
}

export default function NewInvoice() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState("");
  const { toast, node } = useToast();

  async function extract() {
    setBusy("extract");
    try {
      setDraft(await api<Draft>("/api/extract", { text }));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function send() {
    if (!draft) return;
    setBusy("send");
    try {
      await api("/api/invoices", draft);
      toast("Invoice created and sent through PayPal");
      router.push("/");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
      setBusy("");
    }
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const miss = (k: string) => (draft?.missing.includes(k) ? "border-[var(--wait)]" : "");

  return (
    <div className="page fade-in max-w-[1000px]">
      <h1 className="page-title">Invoice from a chat</h1>
      <p className="page-sub">
        Paste the conversation where you agreed on the work. The AI drafts the invoice and leaves blank anything the chat does not say. You check it,
        then it goes out through PayPal.
      </p>

      <div className="flex flex-col gap-4 mt-5">
        <section className="card pad">
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="chat">
              Conversation
            </label>
            <button className="btn btn-ghost btn-sm" onClick={() => setText(SAMPLE)}>
              Use a sample chat
            </button>
          </div>
          <textarea
            id="chat"
            className="textarea mt-2 min-h-[260px]"
            placeholder="Paste a WhatsApp, email or Slack conversation with your client..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn btn-primary mt-3 w-full" disabled={!text.trim() || !!busy} onClick={extract}>
            <Sparkles size={15} className={busy === "extract" ? "animate-pulse" : ""} />
            {busy === "extract" ? "Reading the conversation" : "Draft the invoice"}
          </button>
        </section>

        <section className="card pad">
          <div className="flex items-center justify-between">
            <div className="label">Draft</div>
            {draft && <span className="tag">{draft.engine === "rules" ? "rule extraction" : draft.engine}</span>}
          </div>
          {!draft ? (
            <p className="text-[13px] muted mt-3">The draft appears here. Nothing is sent until you press send.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-3 fade-in">
              {draft.missing.length > 0 && (
                <div className="notice">Not in the chat, please fill in: {draft.missing.join(", ")}</div>
              )}
              <Field label="Client">
                <input className={`input ${miss("clientName")}`} value={draft.clientName} onChange={(e) => set("clientName", e.target.value)} />
              </Field>
              <Field label="Billing email">
                <input className={`input ${miss("clientEmail")}`} value={draft.clientEmail} onChange={(e) => set("clientEmail", e.target.value)} />
              </Field>
              <Field label="Work">
                <input className="input" value={draft.description} onChange={(e) => set("description", e.target.value)} />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Amount">
                  <input
                    className={`input num ${miss("amount")}`}
                    inputMode="decimal"
                    value={draft.amount ?? ""}
                    onChange={(e) => set("amount", e.target.value === "" ? null : Number(e.target.value))}
                  />
                </Field>
                <Field label="Currency">
                  <select className="select" value={draft.currency} onChange={(e) => set("currency", e.target.value)}>
                    {["USD", "EUR", "GBP", "AUD", "SGD"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Due in days">
                  <input
                    className={`input num ${miss("dueInDays")}`}
                    inputMode="numeric"
                    value={draft.dueInDays ?? ""}
                    onChange={(e) => set("dueInDays", e.target.value === "" ? null : Number(e.target.value))}
                  />
                </Field>
              </div>
              <Field label="Note to client">
                <textarea className="textarea min-h-[70px]" value={draft.note} onChange={(e) => set("note", e.target.value)} />
              </Field>
              <button
                className="btn btn-primary mt-1"
                disabled={!!busy || !draft.amount || !draft.clientName || !draft.clientEmail}
                onClick={send}
              >
                <Send size={15} />
                {busy === "send" ? "Sending through PayPal" : `Send ${draft.amount ? money(draft.amount, draft.currency) : ""} invoice through PayPal`}
              </button>
              <p className="text-[12px] muted">
                PayPal emails the invoice with a pay button. In sandbox mode the email goes to your sandbox buyer account (PAYPAL_DEMO_RECIPIENT) if set.
              </p>
            </div>
          )}
        </section>
      </div>
      {node}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
