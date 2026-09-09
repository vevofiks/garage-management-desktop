/**
 * src/lib/invoice-totals.ts
 *
 * Shared invoice math — used by both /api/invoices routes (create + patch)
 * so total/payment-status derivation can never drift between the two.
 */

export type InvoiceItemLike = { type: string; amount: number };

/** parts + labor, minus discounts. Clamped at 0 — a mis-entered discount
 * larger than the rest of the bill shouldn't produce a negative invoice
 * total. */
export function computeInvoiceTotal(items: InvoiceItemLike[]): number {
  const raw = items.reduce(
    (sum, item) => {
      const amt = Number.isFinite(item.amount) ? item.amount : 0;
      return item.type === 'discount' ? sum - amt : sum + amt;
    },
    0
  );
  return Math.max(0, raw);
}

export function derivePaymentStatus(
  totalAmount: number,
  paidAmount: number
): 'unpaid' | 'partial' | 'paid' {
  if (paidAmount <= 0) return 'unpaid';
  if (paidAmount >= totalAmount) return 'paid';
  return 'partial';
}
