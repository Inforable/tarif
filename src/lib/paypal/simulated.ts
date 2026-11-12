import { db, nextSeq, save } from "../store";
import type { CreateInvoiceInput, PayPalCall, PayPalGateway, RemoteInvoice } from "./types";

// Stand-in for PayPal when no sandbox credentials are configured. Same interface as PayPalRest,
// same status vocabulary, labelled SIMULATED everywhere in the UI. Never used when credentials exist.

export class PayPalSimulated implements PayPalGateway {
  mode = "simulated" as const;
  private calls: PayPalCall[] = [];

  drainCalls() {
    const out = this.calls;
    this.calls = [];
    return out;
  }

  private log(method: string, path: string, status = 200) {
    this.calls.push({ method, path, status, ms: 40 + Math.round(Math.random() * 80), debugId: "sim" });
  }

  private sim() {
    return db().sim;
  }

  async createAndSend(input: CreateInvoiceInput): Promise<RemoteInvoice> {
    const n = await nextSeq("TG");
    const s = db();
    const id = `SIM2-${Date.now().toString(36).toUpperCase()}-${n}`;
    this.log("POST", "/v2/invoicing/invoices", 201);
    this.log("POST", `/v2/invoicing/invoices/${id}/send`);
    s.sim[id] = {
      number: `TG-${String(1000 + n)}`,
      status: "SENT",
      amount: input.amount,
      dueDate: input.dueDate,
    };
    save();
    return this.get(id);
  }

  async remind(id: string) {
    this.must(id);
    this.log("POST", `/v2/invoicing/invoices/${id}/remind`, 204);
  }

  async cancel(id: string) {
    const inv = this.must(id);
    if (inv.status === "PAID") throw new Error("Cannot cancel a paid invoice");
    inv.status = "CANCELLED";
    save();
    this.log("POST", `/v2/invoicing/invoices/${id}/cancel`, 204);
  }

  async get(id: string): Promise<RemoteInvoice> {
    const inv = this.must(id);
    this.log("GET", `/v2/invoicing/invoices/${id}`);
    return {
      id,
      number: inv.number,
      status: inv.status,
      payUrl: `/pay/${id}`,
      dueDate: inv.dueDate,
      amount: inv.amount,
    };
  }

  /** Simulated client payment (the /pay/[id] page). */
  pay(id: string) {
    const inv = this.must(id);
    if (inv.status === "CANCELLED") throw new Error("This invoice was cancelled");
    inv.status = "PAID";
    save();
  }

  private must(id: string) {
    const inv = this.sim()[id];
    if (!inv) throw new Error(`Invoice ${id} not found`);
    return inv;
  }
}
