// Domain model for Tagih. One overdue PayPal invoice = one collection case.

export type InvoiceStatus =
  | "DRAFT"
  | "SENT"
  | "SCHEDULED"
  | "PAID"
  | "MARKED_AS_PAID"
  | "PARTIALLY_PAID"
  | "CANCELLED"
  | "REFUNDED"
  | "UNPAID"
  | "PAYMENT_PENDING";

export interface Invoice {
  id: string; // PayPal invoice id (INV2-...) or SIM-...
  number: string;
  clientName: string;
  clientEmail: string;
  description: string;
  amount: number;
  currency: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  status: InvoiceStatus;
  payUrl?: string; // recipient view URL (where the client pays)
  paidAt?: string; // ISO, demo clock
  remindersSent: number;
  lastReminderAt?: string; // ISO, demo clock
  replacedBy?: string; // when cancelled and reissued (discount / split)
  replaces?: string;
  caseId?: string;
  source: "paypal" | "simulated";
  history?: boolean; // synthetic past invoice used as payment history
}

export type ActionType =
  | "friendly_nudge"
  | "firm_reminder"
  | "early_pay_discount"
  | "split_payment"
  | "personal_call";

export type LikelyReason =
  | "forgot"
  | "cash_flow"
  | "unhappy_with_work"
  | "wrong_contact"
  | "habitual_late_payer"
  | "unknown";

export interface Evidence {
  claim: string;
  source: string; // tool call id, e.g. "call_3"
  kind: "fact" | "assumption" | "unknown";
}

export interface PlanOption {
  action: ActionType;
  title: string;
  rationale: string;
  subject: string;
  message: string; // what the client will read
  discountPct?: number;
  installments?: number;
  expectedPayRate?: number; // copied from playbook tool
}

export interface CollectionPlan {
  likelyReason: LikelyReason;
  confidence: number; // 0..1
  summary: string;
  evidence: Evidence[];
  options: PlanOption[];
  recommended: number; // index into options
  considered?: string; // what the agent considered but rejected
}

export type CaseStatus =
  | "OPEN"
  | "RUNNING"
  | "AWAITING_APPROVAL"
  | "BLOCKED"
  | "EXECUTING"
  | "WAITING_PAYMENT"
  | "PAID"
  | "ESCALATED"
  | "DISMISSED"
  | "ERROR";

export type TraceKind =
  | "signal"
  | "phase"
  | "tool"
  | "thought"
  | "decision"
  | "validation"
  | "rejected"
  | "policy"
  | "paypal"
  | "human"
  | "verify"
  | "learn"
  | "fallback"
  | "error";

export type Actor = "agent" | "code" | "paypal" | "person" | "client";

export interface TraceEvent {
  id: string;
  at: number; // real ms timestamp (for live elapsed display)
  kind: TraceKind;
  actor: Actor;
  title: string;
  detail?: string;
  engine?: string; // model id or "rules"
  data?: unknown; // tool input/output, policy rules, PayPal response
  important?: boolean;
  attempt: number;
}

export interface PolicyCheck {
  id: string;
  rule: string;
  outcome: "pass" | "needs_person" | "block";
  detail: string;
}

export interface PolicyResult {
  verdict: "auto" | "needs_person" | "blocked";
  checks: PolicyCheck[];
}

export interface Attempt {
  n: number;
  plan?: CollectionPlan;
  chosen?: number;
  policy?: PolicyResult;
  executedAt?: string; // demo clock ISO
  decidedBy?: "agent" | "person";
  outcome?: "paid" | "not_paid";
  engine?: string;
}

export interface CollectionCase {
  id: string;
  invoiceId: string;
  /** Invoices that must be paid to close the case (the original, or its reissue / installments). */
  activeInvoiceIds: string[];
  status: CaseStatus;
  phase: number; // 0..5 for the live stepper
  openedAt: string; // demo clock ISO
  startedRunAt?: number; // real ms, for elapsed counter
  attempts: Attempt[];
  trace: TraceEvent[];
  closedAt?: string;
  note?: string;
  rev?: number; // write version in the shared store
  busyUntil?: number; // ms timestamp while an agent run or autopilot works on the case (seen by every instance)
}

export interface PlaybookStat {
  action: ActionType;
  segment: string;
  tries: number;
  paid: number;
  totalDaysToPay: number;
}

export interface Settings {
  autonomy: "always_ask" | "policy_based";
  approvalThreshold: number; // amount above which a person must approve
  maxDiscountPct: number;
  reminderCooldownDays: number;
  paymentWindowDays: number; // how long the verifier waits before reopening
  businessName: string;
  model?: string; // OpenAI model the agent uses
}

export interface StoreShape {
  version: number;
  clockOffsetDays: number;
  settings: Settings;
  invoices: Invoice[];
  cases: CollectionCase[];
  playbook: PlaybookStat[];
  seq: number;
  /** Simulated PayPal ledger, only used when no sandbox credentials are configured. */
  sim: Record<string, { number: string; status: InvoiceStatus; amount: number; dueDate: string }>;
}
