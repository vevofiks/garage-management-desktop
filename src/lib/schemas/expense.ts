import { z } from 'zod';

export const expenseCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
});

export type ExpenseCategoryFormData = z.infer<typeof expenseCategorySchema>;

// Plain (non-coerced) types throughout — same reasoning as every other
// schema in this folder: zodResolver needs the schema's input type to match
// useForm's field-value type exactly, and the client always supplies real
// numbers (valueAsNumber on the amount input, setValue() with a real number
// for the category Select).
export const expenseSchema = z.object({
  category_id: z.number().int().positive('Select a category'),
  amount: z.number().positive('Amount must be more than 0'),
  notes: z.string().trim().max(500),
  date: z.string().trim().min(1, 'Date is required'),
});

export type ExpenseFormData = z.infer<typeof expenseSchema>;

/** A direct API caller may omit `notes` entirely — normalize before
 * expenseSchema.parse() so that's treated the same as sending "". */
export function normalizeExpenseInput(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    category_id: b.category_id,
    amount: b.amount,
    notes: b.notes ?? '',
    date: b.date,
  };
}

/**
 * PATCH /api/expenses/[id] body — every field independently optional so an
 * edit can touch just one thing without resending the whole record.
 */
export const updateExpenseSchema = z.object({
  category_id: z.number().int().positive('Select a category').optional(),
  amount: z.number().positive('Amount must be more than 0').optional(),
  notes: z.string().trim().max(500).optional(),
  date: z.string().trim().min(1, 'Date is required').optional(),
});

export type UpdateExpenseFormData = z.infer<typeof updateExpenseSchema>;
