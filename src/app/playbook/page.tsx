"use client";

import { usePoll } from "@/components/ui";
import type { OverviewView } from "@/lib/views";

const SEGMENT: Record<string, string> = {
  reliable: "Reliable payers",
  slow_payer: "Slow payers (irregular, cash-flow)",
  habitual_late: "Habitually late (consistent delay)",
  new: "New clients (no history)",
};

export default function Playbook() {
  const { data } = usePoll<OverviewView>("/api/state");
  if (!data) return <div className="pt-8 animate-pulse h-96 rounded bg-[var(--surface)] mt-8" />;
  const segments = [...new Set(data.playbook.map((p) => p.segment))];

  return (
    <div className="page fade-in max-w-[900px]">
      <h1 className="page-title">Playbook</h1>
      <p className="page-sub">What got clients to pay, by strategy and client type.</p>

      <div className="flex flex-col gap-4 mt-6">
        {segments.map((seg) => (
          <section key={seg} className="card">
            <div className="px-4 pt-4 pb-2 font-semibold">{SEGMENT[seg] ?? seg}</div>
            <div className="scroll-x">
              <table className="table">
                <thead>
                  <tr className="label">
                    <th>Strategy</th>
                    <th className="text-right">Tries</th>
                    <th className="text-right">Paid</th>
                    <th className="w-[38%]">Pay rate</th>
                    <th className="text-right">Avg days to pay</th>
                  </tr>
                </thead>
                <tbody>
                  {data.playbook
                    .filter((p) => p.segment === seg)
                    .map((p) => (
                      <tr key={p.action}>
                        <td className="font-medium">{p.label}</td>
                        <td className="num text-right">{p.tries}</td>
                        <td className="num text-right">{p.paid}</td>
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="h-1.5 flex-1 rounded bg-[var(--surface-2)] overflow-hidden">
                              <div className="h-full bg-[var(--ink)]" style={{ width: `${Math.round(p.payRate * 100)}%` }} />
                            </div>
                            <span className="num w-10 text-right">{Math.round(p.payRate * 100)}%</span>
                          </div>
                        </td>
                        <td className="num text-right">{p.paid ? (p.totalDaysToPay / p.paid).toFixed(1) : "none"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
