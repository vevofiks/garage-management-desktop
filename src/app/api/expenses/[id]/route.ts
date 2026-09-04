import { requireRole } from '@/lib/auth';
import { ok, badRequest, notFound, withErrorHandling } from '@/lib/http';
import { updateExpenseSchema } from '@/lib/schemas/expense';
import { logAudit } from '@/lib/audit';
import { formatCurrency } from '@/lib/format';
import db from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandling<Ctx>(async (req, { params }) => {
  const user = await requireRole(['admin', 'staff']);
  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id)) return badRequest('Invalid ID');

  const body = await req.json();
  const { category_id, amount, notes, date } = updateExpenseSchema.parse(body);

  if (category_id === undefined && amount === undefined && notes === undefined && date === undefined) {
    return badRequest('Nothing to update');
  }

  if (category_id !== undefined) {
    const category = db.prepare('SELECT id FROM expense_categories WHERE id = ?').get(category_id);
    if (!category) return badRequest('Category not found');
  }

  const setClauses: string[] = [];
  const setParams: (string | number | null)[] = [];
  if (category_id !== undefined) {
    setClauses.push('category_id = ?');
    setParams.push(category_id);
  }
  if (amount !== undefined) {
    setClauses.push('amount = ?');
    setParams.push(amount);
  }
  if (notes !== undefined) {
    setClauses.push('notes = ?');
    setParams.push(notes || null);
  }
  if (date !== undefined) {
    setClauses.push('date = ?');
    setParams.push(date);
  }

  const result = db
    .prepare(`UPDATE expenses SET ${setClauses.join(', ')} WHERE id = ?`)
    .run(...setParams, id);
  if (result.changes === 0) return notFound('Expense not found');

  const expense = db
    .prepare(
      `SELECT expenses.*, expense_categories.name AS category_name
       FROM expenses
       JOIN expense_categories ON expense_categories.id = expenses.category_id
       WHERE expenses.id = ?`
    )
    .get(id) as { amount: number; category_name: string };

  logAudit(
    user,
    'expense.updated',
    `Updated ${formatCurrency(expense.amount)} expense in ${expense.category_name}`
  );

  return ok(expense);
});

export const DELETE = withErrorHandling<Ctx>(async (req, { params }) => {
  const user = await requireRole(['admin', 'staff']);
  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id)) return badRequest('Invalid ID');

  const existing = db
    .prepare(
      `SELECT expenses.amount, expense_categories.name AS category_name
       FROM expenses
       JOIN expense_categories ON expense_categories.id = expenses.category_id
       WHERE expenses.id = ?`
    )
    .get(id) as { amount: number; category_name: string } | undefined;
  if (!existing) return notFound('Expense not found');

  const result = db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  if (result.changes === 0) return notFound('Expense not found');
  logAudit(
    user,
    'expense.deleted',
    `Deleted ${formatCurrency(existing.amount)} expense in ${existing.category_name}`
  );
  return ok({ success: true });
});
