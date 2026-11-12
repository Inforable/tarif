"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Cpu } from "lucide-react";
import { MODELS, modelLabel } from "@/lib/models";
import { api } from "./ui";

// Pick the model the agent runs on. The choice is stored in settings and recorded on every trace step.

export function ModelPicker({ compact = false, onChange }: { compact?: boolean; onChange?: (id: string) => void }) {
  const [model, setModel] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(true);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    api<{ model: string; hasKey: boolean }>("/api/settings")
      .then((s) => {
        if (!alive) return;
        setModel(s.model);
        setHasKey(s.hasKey);
      })
      .catch(() => {});
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => {
      alive = false;
      document.removeEventListener("mousedown", close);
    };
  }, []);

  async function pick(id: string) {
    setOpen(false);
    setModel(id);
    await api("/api/settings", { model: id }).catch(() => {});
    onChange?.(id);
  }

  return (
    <div className="relative" ref={box}>
      <button className={`model-btn ${compact ? "model-btn-sm" : ""}`} onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
        <Cpu size={14} />
        <span className="truncate">{hasKey ? (model ? modelLabel(model) : "Model") : "Rule engine"}</span>
        <ChevronDown size={13} className="muted" />
      </button>
      {open && (
        <div className="menu fade-in" role="listbox" aria-label="Agent model">
          <div className="label px-3 pt-2 pb-1">Agent model</div>
          {MODELS.map((m) => (
            <button key={m.id} role="option" aria-selected={m.id === model} className="menu-item" onClick={() => pick(m.id)} disabled={!hasKey}>
              <span className="flex-1 text-left">
                <span className="block font-medium">{m.label}</span>
                <span className="block text-[12px] muted">{m.note}</span>
              </span>
              {m.id === model && <Check size={15} />}
            </button>
          ))}
          {!hasKey && <p className="text-[12px] muted px-3 pb-3">Set OPENAI_API_KEY to use a model. Until then the rule engine plans.</p>}
        </div>
      )}
    </div>
  );
}
