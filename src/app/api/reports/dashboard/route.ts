import { requireRole } from '@/lib/auth';
import { ok, withErrorHandling } from '@/lib/http';
import db from '@/lib/db';

const RECENT_LIMIT = 5;

/**
 * Everything the admin home dashboard needs in one round trip — this-month
 * stat totals, plus the last few customers/invoices — so the page that's
 * meant to be "minimal and fast for daily use" doesn't have to wait on
 * several separate requests before it can render anything.
 */
export const GET = withErrorHandling(async () => {
  await requireRole('admin');

  // "This month" in local date format (YYYY-MM-01)
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const { sales, total_invoiced, balance_due, invoice_count } = db
    .prepare(
      `SELECT COALESCE(SUM(paid_amount), 0) AS sales,
              COALESCE(SUM(total_amount), 0) AS total_invoiced,
              COALESCE(SUM(total_amount - paid_amount), 0) AS balance_due,
              COUNT(*) AS invoice_count
       FROM invoices
       WHERE date(created_at) >= ?`
    )
    .get(monthStart) as { sales: number; total_invoiced: number; balance_due: number; invoice_count: number };

  const { expenses } = db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS expenses FROM expenses WHERE date >= ?`)
    .get(monthStart) as { expenses: number };

  const recentCustomers = db
    .prepare(
      `SELECT customers.id, customers.name, customers.phone, customers.created_at,
              GROUP_CONCAT(
                CASE
                  WHEN vehicles.vehicle_number IS NOT NULL AND vehicles.vehicle_number != '' AND vehicles.vehicle_model IS NOT NULL AND vehicles.vehicle_model != ''
                    THEN vehicles.vehicle_number || ' (' || vehicles.vehicle_model || ')'
                  WHEN vehicles.vehicle_number IS NOT NULL AND vehicles.vehicle_number != ''
                    THEN vehicles.vehicle_number
                  WHEN vehicles.vehicle_model IS NOT NULL AND vehicles.vehicle_model != ''
                    THEN vehicles.vehicle_model
                  ELSE NULL
                END,
                ', '
              ) AS vehicle_numbers
       FROM customers
       LEFT JOIN vehicles ON vehicles.customer_id = customers.id
       GROUP BY customers.id
       ORDER BY customers.created_at DESC
       LIMIT ?`
    )
    .all(RECENT_LIMIT);

  const recentInvoices = db
    .prepare(
      `SELECT invoices.id, invoices.total_amount, invoices.paid_amount, invoices.payment_status,
              invoices.created_at, customers.name AS customer_name,
              vehicles.vehicle_number, vehicles.vehicle_model
       FROM invoices
       JOIN customers ON customers.id = invoices.customer_id
       LEFT JOIN vehicles ON vehicles.id = invoices.vehicle_id
       ORDER BY invoices.created_at DESC
       LIMIT ?`
    )
    .all(RECENT_LIMIT);

  const recentExpenses = db
    .prepare(
      `SELECT expenses.id, expenses.amount, expenses.notes, expenses.date, expenses.created_at,
              expense_categories.name AS category_name
       FROM expenses
       JOIN expense_categories ON expense_categories.id = expenses.category_id
       ORDER BY expenses.created_at DESC
       LIMIT ?`
    )
    .all(RECENT_LIMIT);

  return ok({
    sales,
    balanceDue: Math.max(0, balance_due),
    totalInvoiced: total_invoiced,
    expenses,
    profit: sales - expenses,
    invoiceCount: invoice_count,
    recentCustomers,
    recentInvoices,
    recentExpenses,
  });
});
