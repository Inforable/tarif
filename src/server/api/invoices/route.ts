import { createInvoice, type InvoiceDraftInput } from "@/lib/cases";
import { body, fail, ok } from "@/lib/http";

export async function POST(req: Request) {
  const d = await body<InvoiceDraftInput>(req);
  const problems = [
    !d.clientName?.trim() && "client name",
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.clientEmail ?? "") && "a valid email",
    !d.description?.trim() && "a description",
    !(Number(d.amount) > 0) && "an amount above 0",
  ].filter(Boolean);
  if (problems.length) return fail(new Error(`Missing ${problems.join(", ")}`));
  try {
    const inv = await createInvoice({
      clientName: d.clientName.trim(),
      clientEmail: d.clientEmail.trim(),
      description: d.description.trim(),
      amount: Math.round(Number(d.amount) * 100) / 100,
      currency: (d.currency || "USD").toUpperCase(),
      dueInDays: Math.max(0, Math.min(90, Number(d.dueInDays) || 0)),
      note: d.note,
    });
    return ok(inv);
  } catch (e) {
    return fail(e, 502);
  }
}
