import type { InvoiceStatus } from "../types";

export interface CreateInvoiceInput {
  clientName: string;
  clientEmail: string;
  description: string;
  amount: number;
  currency: string;
  invoiceDate: string; // YYYY-MM-DD (real date; PayPal rejects odd dates)
  dueDate: string; // YYYY-MM-DD
  note?: string;
}

export interface RemoteInvoice {
  id: string;
  number: string;
  status: InvoiceStatus;
  payUrl?: string;
  dueDate?: string;
  amount?: number;
}

export interface PayPalCall {
  method: string;
  path: string;
  status: number;
  ms: number;
  debugId?: string;
}

/** The only surface the rest of the app uses to talk to PayPal. */
export interface PayPalGateway {
  mode: "sandbox" | "simulated";
  createAndSend(input: CreateInvoiceInput, subject?: string): Promise<RemoteInvoice>;
  remind(id: string, subject: string, note: string): Promise<void>;
  cancel(id: string, subject: string, note: string): Promise<void>;
  get(id: string): Promise<RemoteInvoice>;
  /** Calls made since the last drain, shown in the agent trace as PayPal events. */
  drainCalls(): PayPalCall[];
}
