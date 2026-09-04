import { z } from 'zod';
import { computeInvoiceTotal } from '../invoice-totals';

// Plain (non-coerced) types throughout — same reasoning as customer.ts:
// zodResolver needs the schema's input type to match useForm's field-value
// type exactly, and the client always supplies real numbers (valueAsNumber
// on inputs, setValue() with real numbers for selects).

// Money fields (`amount`, `paid_amount`) are bound to `<input type="number">`
// with a `setValueAs` that turns a blank field into 0 before it ever reaches
// this schema (see invoice-items-field.tsx / the payment forms) — not
// `valueAsNumber`, which would hand this schema `NaN` for an empty input and
// surface zod's generic "Invalid input: expected number, received NaN"
// instead of just treating "left blank" as "0", a valid amount here (e.g.
// "nothing paid yet"). Kept as plain `z.number()` (not `.preprocess()`) so
// the schema's input type still matches useForm's field-value type exactly
// — the same zodResolver-typing reason documented in customer.ts et al.

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, 'Description is required').max(200),
  type: z.enum(['part', 'labor', 'discount']),
  amount: z.number().nonnegative('Amount must be 0 or more'),
});

export type InvoiceItemFormData = z.infer<typeof invoiceItemSchema>;

/** The frontend's item-editor form (used both at creation and on the
 * invoice detail page's "edit items" form). */
export const invoiceItemsSchema = z.object({
  items: z.array(invoiceItemSchema).min(1, 'Add at least one line item'),
});

export type InvoiceItemsFormData = z.infer<typeof invoiceItemsSchema>;

export const paymentMethodSchema = z.enum(['cash', 'card', 'both', 'other']);

export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  both: 'Both (Cash & Card)',
  other: 'Other',
};

/** The frontend's "record a payment" form — kept separate from items so
 * recording a payment never has to resend/revalidate the whole item list.
 * `payment_method_note` is required when payment_method is 'other' or 'both'
 * to describe the breakdown or payment method detail. */
export const paymentSchema = z
  .object({
    paid_amount: z.number().nonnegative('Paid amount must be 0 or more'),
    payment_method: paymentMethodSchema,
    payment_method_note: z.string().trim().max(200),
  })
  .refine(
    (data) =>
      (data.payment_method !== 'other' && data.payment_method !== 'both') ||
      data.payment_method_note !== '',
    {
      message: 'Payment details required',
      path: ['payment_method_note'],
    }
  );

export type PaymentFormData = z.infer<typeof paymentSchema>;

/**
 * POST /api/invoices body. There is no "Services" module to bill from — an
 * invoice is the only record of work done, created directly for a customer
 * (and optionally one of their vehicles) with its line items right here.
 * Payment can be recorded in the same step (amount + method) — the same
 * fields the invoice detail page's "Record a Payment" form edits later —
 * since a garage invoice is very often paid on the spot, at creation time.
 */
export const createInvoiceSchema = z
  .object({
    customer_id: z.number().int().positive('Select a customer'),
    vehicle_id: z.number().int().positive().nullable(),
    notes: z.string().trim().max(1000).optional(),
    items: z.array(invoiceItemSchema).min(1, 'Add at least one line item'),
    paid_amount: z.number().nonnegative('Paid amount must be 0 or more'),
    payment_method: paymentMethodSchema,
    payment_method_note: z.string().trim().max(200),
  })
  .refine(
    (data) =>
      (data.payment_method !== 'other' && data.payment_method !== 'both') ||
      data.payment_method_note !== '',
    {
      message: 'Payment details required',
      path: ['payment_method_note'],
    }
  )
  // Amount paid can never exceed what the line items actually add up to —
  // checked against the same computeInvoiceTotal() the server uses to store
  // total_amount, so client and server can never disagree about the cap.
  .refine((data) => data.paid_amount <= computeInvoiceTotal(data.items), {
    message: 'Amount paid cannot be more than the invoice total',
    path: ['paid_amount'],
  });

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

/** A direct API caller may omit the optional fields entirely — normalize
 * before createInvoiceSchema.parse() so that's treated the same as "". */
export function normalizeCreateInvoiceInput(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    customer_id: b.customer_id,
    vehicle_id: b.vehicle_id ?? null,
    notes: b.notes ?? '',
    items: b.items ?? [],
    paid_amount: b.paid_amount ?? 0,
    payment_method: b.payment_method ?? 'cash',
    payment_method_note: b.payment_method_note ?? '',
  };
}

/**
 * PATCH /api/invoices/[id] body — a superset of what either client form
 * above sends; every field is independently optional (recording a payment
 * shouldn't require resending every item, and vice versa), but at least one
 * must be present (enforced in the route handler, not here).
 */
export const updateInvoiceSchema = z.object({
  items: z.array(invoiceItemSchema).min(1, 'Add at least one line item').optional(),
  paid_amount: z.number().nonnegative('Paid amount must be 0 or more').optional(),
  payment_method: paymentMethodSchema.optional(),
  payment_method_note: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
