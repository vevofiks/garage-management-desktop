import { requireRole } from '@/lib/auth';
import { ok, badRequest, withErrorHandling } from '@/lib/http';
import { expenseCategorySchema } from '@/lib/schemas/expense';
import db from '@/lib/db';

// Reading the category list is open to staff too — they need it to log an
// expense. Creating new categories stays admin-only: it's financial
// configuration, not a day-to-day logging action.

export const GET = withErrorHandling(async () => {
  await requireRole(['admin', 'staff']);
  const categories = db.prepare('SELECT id, name FROM expense_categories ORDER BY name').all();
  return ok(categories);
});

export const POST = withErrorHandling(async (req) => {
  await requireRole('admin');
  const body = await req.json();
  const { name } = expenseCategorySchema.parse(body);

  try {
    const info = db.prepare('INSERT INTO expense_categories (name) VALUES (?)').run(name);
    const category = db
      .prepare('SELECT id, name FROM expense_categories WHERE id = ?')
      .get(info.lastInsertRowid);
    return ok(category, { status: 201 });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return badRequest('A category with this name already exists');
    }
    throw error;
  }
});
