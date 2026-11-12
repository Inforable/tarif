"use client";

import { useRef, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Mark } from "./Logo";

// Opening screen, shown once per browser session (modelled on Wasit's welcome).
// Visibility is decided before paint by the inline script in layout.tsx (html[data-welcomed]),
// so returning visitors never see it flash.

export const INTRO_SCRIPT = `try{if(sessionStorage.getItem("tagih:welcomed"))document.documentElement.dataset.welcomed="1"}catch(e){}`;

export function Intro() {
  const [launching, setLaunching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function start() {
    if (launching) return;
    setLaunching(true);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    timer.current = setTimeout(
      () => {
        try {
          sessionStorage.setItem("tagih:welcomed", "1");
        } catch {}
        document.documentElement.dataset.welcomed = "1";
      },
      reduce ? 0 : 1100,
    );
  }

  return (
    <div className="intro" role="dialog" aria-modal="true" aria-labelledby="intro-title">
      <div className="intro-backdrop" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <main className="intro-main">
        <div className="intro-logo">
          <span className="intro-halo" aria-hidden="true" />
          <span className="intro-mark">
            <Mark size={84} />
          </span>
        </div>
        <div className="reveal d1 intro-word" aria-label="Tagih">
          tagih
        </div>
        <p className="intro-eyebrow reveal d2">AGENTIC COLLECTIONS ON PAYPAL</p>
        <h1 id="intro-title" className="intro-slogan">
          <span className="reveal d3">Get paid on time.</span>
          <span className="reveal d4 tone-accent">Without the awkward follow-ups.</span>
        </h1>
        <p className="intro-lede reveal d5">
          When a PayPal invoice goes overdue, Tagih&apos;s agent works out why, picks how to ask, and follows up through PayPal within the limits you set.
        </p>
        <ul className="intro-benefits reveal d6">
          <li>
            <Check size={15} aria-hidden="true" />
            Reads PayPal and the client&apos;s history
          </li>
          <li>
            <Check size={15} aria-hidden="true" />
            Asks you before anything risky
          </li>
          <li>
            <Check size={15} aria-hidden="true" />
            Closes only when PayPal says PAID
          </li>
        </ul>
        <div className="intro-actions reveal d7">
          <button className="intro-cta" onClick={start} disabled={launching} autoFocus>
            <span>Start collecting</span>
            <ArrowRight size={18} />
          </button>
          <p className="intro-safety">PayPal sandbox and demo clients. No real money moves.</p>
        </div>
      </main>
      {launching && (
        <div className="takeover" aria-hidden="true">
          <div className="takeover-glow" />
          <div className="takeover-mark">
            <i />
            <i />
            <i />
            <Mark size={64} live />
          </div>
          <p>Preparing your receivables...</p>
        </div>
      )}
    </div>
  );
}
