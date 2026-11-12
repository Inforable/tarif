import type { Invoice, PlaybookStat, StoreShape } from "./types";
import { addDays, realToday } from "./clock";

// Synthetic payment history and playbook priors. Labelled "seed history" in the UI.
// Open invoices are NOT seeded here: they are created through the PayPal client
// ("Create demo invoices"), so in sandbox mode they are real PayPal invoices.

export interface DemoClient {
  name: string;
  description: string;
  amount: number;
  dueInDays: number;
  // past invoices: [amount, daysLateWhenPaid | null for still unpaid at the time, remindersNeeded]
  past: Array<[number, number, number]>;
  note: string;
}

export const DEMO_CLIENTS: DemoClient[] = [
  {
    name: "Studio Rimba",
    description: "Brand identity refresh: logo system and guidelines",
    amount: 420,
    dueInDays: 3,
    past: [
      [380, 2, 1],
      [250, 1, 1],
      [300, 3, 1],
    ],
    note: "Reliable agency. Usually pays a day or two after one reminder.",
  },
  {
    name: "Kopi Lereng",
    description: "Packaging illustration, 3 SKUs",
    amount: 1250,
    dueInDays: 5,
    past: [
      [900, 18, 2],
      [600, 25, 3],
    ],
    note: "Small roastery. Paid late twice; once asked to pay in two parts.",
  },
  {
    name: "Nusa Travel",
    description: "Landing page copy and 4 blog articles",
    amount: 640,
    dueInDays: 2,
    past: [
      [500, 14, 2],
      [450, 12, 3],
      [520, 16, 2],
    ],
    note: "Pays every invoice, always about two weeks late.",
  },
  {
    name: "Arka Digital",
    description: "UI audit for mobile onboarding",
    amount: 300,
    dueInDays: 4,
    past: [],
    note: "New client. No payment history.",
  },
];

function historyFor(): Invoice[] {
  const today = realToday();
  const out: Invoice[] = [];
  let n = 1;
  for (const c of DEMO_CLIENTS) {
    c.past.forEach(([amount, late, reminders], i) => {
      const due = addDays(today, -60 * (c.past.length - i) - 10);
      out.push({
        id: `HIST-${String(n).padStart(3, "0")}`,
        number: `H-${String(n++).padStart(3, "0")}`,
        clientName: c.name,
        clientEmail: "",
        description: "Earlier project",
        amount,
        currency: "USD",
        issueDate: addDays(due, -14),
        dueDate: due,
        status: "PAID",
        paidAt: addDays(due, late) + "T09:00:00.000Z",
        remindersSent: reminders,
        source: "simulated",
        history: true,
      });
    });
  }
  return out;
}

// Prior outcomes of each strategy per client segment (synthetic, small counts on purpose:
// the UI shows the count next to every rate).
const PRIOR: PlaybookStat[] = [
  { action: "friendly_nudge", segment: "reliable", tries: 9, paid: 8, totalDaysToPay: 16 },
  { action: "firm_reminder", segment: "reliable", tries: 2, paid: 2, totalDaysToPay: 3 },
  { action: "friendly_nudge", segment: "slow_payer", tries: 7, paid: 2, totalDaysToPay: 19 },
  { action: "firm_reminder", segment: "slow_payer", tries: 6, paid: 4, totalDaysToPay: 21 },
  { action: "split_payment", segment: "slow_payer", tries: 3, paid: 3, totalDaysToPay: 12 },
  { action: "early_pay_discount", segment: "slow_payer", tries: 4, paid: 3, totalDaysToPay: 8 },
  { action: "friendly_nudge", segment: "habitual_late", tries: 8, paid: 2, totalDaysToPay: 22 },
  { action: "firm_reminder", segment: "habitual_late", tries: 6, paid: 5, totalDaysToPay: 20 },
  { action: "early_pay_discount", segment: "habitual_late", tries: 3, paid: 1, totalDaysToPay: 4 },
  { action: "friendly_nudge", segment: "new", tries: 5, paid: 3, totalDaysToPay: 11 },
  { action: "personal_call", segment: "new", tries: 2, paid: 1, totalDaysToPay: 6 },
];

export function seedStore(version: number): StoreShape {
  return {
    version,
    clockOffsetDays: 0,
    seq: 0,
    settings: {
      autonomy: "always_ask",
      approvalThreshold: 500,
      maxDiscountPct: 10,
      reminderCooldownDays: 3,
      paymentWindowDays: 5,
      businessName: process.env.TAGIH_BUSINESS_NAME || "Raka Studio",
    },
    invoices: historyFor(),
    cases: [],
    playbook: PRIOR.map((p) => ({ ...p })),
    sim: {},
  };
}
