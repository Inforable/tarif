import { PayPalRest } from "./rest";
import { PayPalSimulated } from "./simulated";
import type { PayPalGateway } from "./types";

export type { PayPalGateway } from "./types";

const g = globalThis as unknown as { __tagihPayPal?: PayPalGateway };

/** PayPal sandbox when PAYPAL_CLIENT_ID/SECRET are set, otherwise the labelled simulator. */
export function paypal(): PayPalGateway {
  if (!g.__tagihPayPal) {
    const id = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;
    g.__tagihPayPal = id && secret ? new PayPalRest(id, secret) : new PayPalSimulated();
  }
  return g.__tagihPayPal;
}

export function simulator(): PayPalSimulated | null {
  const p = paypal();
  return p instanceof PayPalSimulated ? p : null;
}

/** Email the demo invoices go to. In sandbox, set this to your sandbox Personal (buyer) account. */
export function demoRecipient(fallback: string): string {
  return process.env.PAYPAL_DEMO_RECIPIENT || fallback;
}
