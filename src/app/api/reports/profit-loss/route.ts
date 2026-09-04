import { requireRole } from '@/lib/auth';
import { ok, badRequest, withErrorHandling } from '@/lib/http';
import db from '@/lib/db';

// SQLite strftime format per grouping — 'week' uses ISO-ish %W (week-of-year,
// Monday first) prefixed with the year so weeks don't collide across years.
const GROUP_FORMAT: Record<string, string> = {
  day: '%Y-%m-%d',
  week: '%Y-W%W',
  month: '%Y-%m',
};

type PeriodRow = { period: string; revenue: number; expenses: number };

/**
 * Revenue here is "collected" (SUM(invoices.paid_amount)), not billed total
 * — the PRD's "total revenue (from invoices)" is ambiguous, and what the
 * garage actually banked is the more useful number for a P&L view.
 */
export const GET = withErrorHandling(async (req) => {
  await requireRole('admin');

  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  const groupBy = req.nextUrl.searchParams.get('groupBy') ?? 'day';

  if (!from || !to) return badRequest('from and to are required');
  const format = GROUP_FORMAT[groupBy];
  if (!format) return badRequest('groupBy must be day, week, or month');

  const revenueRows = db
    .prepare(
      `SELECT strftime(?, created_at) AS period, COALESCE(SUM(paid_amount), 0) AS revenue
       FROM invoices
       WHERE date(created_at) >= ? AND date(created_at) <= ?
       GROUP BY period`
    )
    .all(format, from, to) as { period: string; revenue: number }[];

  const expenseRows = db
    .prepare(
      `SELECT strftime(?, date) AS period, COALESCE(SUM(amount), 0) AS expenses
       FROM expenses
       WHERE date >= ? AND date <= ?
       GROUP BY period`
    )
    .all(format, from, to) as { period: string; expenses: number }[];

  // Merge the two independently-grouped sums into one row per period —
  // a period with invoices but no expenses (or vice versa) still needs to
  // show up with a 0 on the missing side, not be dropped.
  const periods = new Map<string, PeriodRow>();
  for (const row of revenueRows) {
    periods.set(row.period, { period: row.period, revenue: row.revenue, expenses: 0 });
  }
  for (const row of expenseRows) {
    const existing = periods.get(row.period);
    if (existing) existing.expenses = row.expenses;
    else periods.set(row.period, { period: row.period, revenue: 0, expenses: row.expenses });
  }

  const result = Array.from(periods.values())
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((row) => ({ ...row, net: row.revenue - row.expenses }));

  return ok(result);
});
