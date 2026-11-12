import type { InvoiceStatus } from "../types";
import type { CreateInvoiceInput, PayPalCall, PayPalGateway, RemoteInvoice } from "./types";

// PayPal Invoicing API v2 over REST (sandbox by default).
// Docs: https://developer.paypal.com/docs/api/invoicing/v2/

const BASE = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";

export class PayPalError extends Error {
  constructor(
    message: string,
    public status: number,
    public debugId?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

interface RawInvoice {
  id: string;
  status: InvoiceStatus;
  detail?: {
    invoice_number?: string;
    payment_term?: { due_date?: string };
    metadata?: { recipient_view_url?: string };
  };
  amount?: { value?: string };
}

export class PayPalRest implements PayPalGateway {
  mode = "sandbox" as const;
  private token?: { value: string; expires: number };
  private calls: PayPalCall[] = [];

  constructor(
    private clientId: string,
    private clientSecret: string,
  ) {}

  drainCalls() {
    const out = this.calls;
    this.calls = [];
    return out;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expires > Date.now() + 60_000) return this.token.value;
    const res = await fetch(`${BASE}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new PayPalError(`PayPal OAuth failed (${res.status})`, res.status);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, expires: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }

  private async call<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const started = Date.now();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.accessToken()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
    if (idempotencyKey) headers["PayPal-Request-Id"] = idempotencyKey;
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const debugId = res.headers.get("paypal-debug-id") ?? undefined;
    this.calls.push({ method, path, status: res.status, ms: Date.now() - started, debugId });
    const text = await res.text();
    const json = text ? safeJson(text) : undefined;
    if (!res.ok) {
      const j = json as { message?: string; details?: Array<{ issue?: string; description?: string }> } | undefined;
      const issue = j?.details?.map((d) => d.description || d.issue).join("; ");
      throw new PayPalError(
        `PayPal ${method} ${path} failed (${res.status}): ${issue || j?.message || text.slice(0, 200)}`,
        res.status,
        debugId,
        json,
      );
    }
    return json as T;
  }

  async createAndSend(input: CreateInvoiceInput, subject?: string): Promise<RemoteInvoice> {
    const [given, ...rest] = input.clientName.trim().split(/\s+/);
    const created = await this.call<RawInvoice>("POST", "/v2/invoicing/invoices", {
      detail: {
        currency_code: input.currency,
        invoice_date: input.invoiceDate,
        payment_term: { due_date: input.dueDate },
        note: input.note || "Thank you for your business.",
        memo: "Created by Tagih",
      },
      primary_recipients: [
        {
          billing_info: {
            name: { given_name: given || input.clientName, surname: rest.join(" ") || "Team" },
            email_address: input.clientEmail,
          },
        },
      ],
      items: [
        {
          name: input.description.slice(0, 200),
          quantity: "1",
          unit_amount: { currency_code: input.currency, value: input.amount.toFixed(2) },
          unit_of_measure: "AMOUNT",
        },
      ],
    });
    await this.call("POST", `/v2/invoicing/invoices/${created.id}/send`, {
      send_to_invoicer: false,
      send_to_recipient: true,
      subject: subject || `Invoice for ${input.description}`.slice(0, 200),
    });
    return this.get(created.id);
  }

  async remind(id: string, subject: string, note: string) {
    await this.call("POST", `/v2/invoicing/invoices/${id}/remind`, {
      subject: subject.slice(0, 200),
      note: note.slice(0, 4000),
      send_to_invoicer: false,
      send_to_recipient: true,
    });
  }

  async cancel(id: string, subject: string, note: string) {
    await this.call("POST", `/v2/invoicing/invoices/${id}/cancel`, {
      subject: subject.slice(0, 200),
      note: note.slice(0, 4000),
      send_to_invoicer: false,
      send_to_recipient: true,
    });
  }

  async get(id: string): Promise<RemoteInvoice> {
    const raw = await this.call<RawInvoice>("GET", `/v2/invoicing/invoices/${id}`);
    return {
      id: raw.id,
      number: raw.detail?.invoice_number ?? raw.id,
      status: raw.status,
      payUrl: raw.detail?.metadata?.recipient_view_url,
      dueDate: raw.detail?.payment_term?.due_date,
      amount: raw.amount?.value ? Number(raw.amount.value) : undefined,
    };
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
