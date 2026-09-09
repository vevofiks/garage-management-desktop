import { requireRole } from '@/lib/auth';
import { ok, badRequest, parsePagination, withErrorHandling } from '@/lib/http';
import { expenseSchema, normalizeExpenseInput } from '@/lib/schemas/expense';
import { logAudit } from '@/lib/audit';
import { formatCurrency } from '@/lib/format';
import db from '@/lib/db';

export const GET = withErrorHandling(async (req) => {
  await requireRole(['admin', 'staff']);

  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  const categoryId = req.nextUrl.searchParams.get('category_id');
  const { page, pageSize, offset } = parsePagination(req.nextUrl.searchParams);

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (from) {
    conditions.push('expenses.date >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('expenses.date <= ?');
    params.push(to);
  }
  if (categoryId) {
    conditions.push('expenses.category_id = ?');
    params.push(Number(categoryId));
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // total/totalAmount cover the whole filtered set (not just the current
  // page) — the page's "Total" footer needs the filtered sum regardless of
  // which page is showing, same as the paging metadata needs the filtered
  // count regardless of page size.
  const { total, totalAmount } = db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(expenses.amount), 0) AS totalAmount
       FROM expenses ${where}`
    )
    .get(...params) as { total: number; totalAmount: number };

  const expenses = db
    .prepare(
      `SELECT
         expenses.id, expenses.category_id, expenses.amount, expenses.notes, expenses.date, expenses.created_at,
         expense_categories.name AS category_name
       FROM expenses
       JOIN expense_categories ON expense_categories.id = expenses.category_id
       ${where}
       ORDER BY expenses.date DESC, expenses.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);

  return ok({
    data: expenses,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    totalAmount,
  });
});

export const POST = withErrorHandling(async (req) => {
  const user = await requireRole(['admin', 'staff']);

  const body = await req.json();
  const { category_id, amount, notes, date } = expenseSchema.parse(normalizeExpenseInput(body));

  const category = db.prepare('SELECT id, name FROM expense_categories WHERE id = ?').get(category_id) as
    | { id: number; name: string }
    | undefined;
  if (!category) return badRequest('Category not found');

  const info = db
    .prepare('INSERT INTO expenses (category_id, amount, notes, date) VALUES (?, ?, ?, ?)')
    .run(category_id, amount, notes || null, date);

  logAudit(user, 'expense.created', `Logged ${formatCurrency(amount)} expense in ${category.name}`);

  const expense = db
    .prepare(
      `SELECT expenses.*, expense_categories.name AS category_name
       FROM expenses
       JOIN expense_categories ON expense_categories.id = expenses.category_id
       WHERE expenses.id = ?`
    )
    .get(info.lastInsertRowid);
  return ok(expense, { status: 201 });
});
