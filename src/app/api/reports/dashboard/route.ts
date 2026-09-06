import { requireRole } from '@/lib/auth';
import { ok, withErrorHandling } from '@/lib/http';
import { CUSTOMER_VEHICLE_LIST_SQL } from '@/lib/customer-list';
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
       WHERE COALESCE(service_date, date(created_at)) >= ?`
    )
    .get(monthStart) as { sales: number; total_invoiced: number; balance_due: number; invoice_count: number };

  const { credit_outstanding, credit_invoice_count_month } = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN payment_method = 'credit' AND payment_status != 'paid'
           THEN total_amount - paid_amount ELSE 0 END), 0) AS credit_outstanding,
         COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN 1 ELSE 0 END), 0) AS credit_invoice_count_month
       FROM invoices
       WHERE COALESCE(service_date, date(created_at)) >= ?`
    )
    .get(monthStart) as { credit_outstanding: number; credit_invoice_count_month: number };

  const { credit_outstanding_all } = db
    .prepare(
      `SELECT COALESCE(SUM(total_amount - paid_amount), 0) AS credit_outstanding_all
       FROM invoices
       WHERE payment_method = 'credit' AND payment_status != 'paid'`
    )
    .get() as { credit_outstanding_all: number };

  const { expenses } = db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS expenses FROM expenses WHERE date >= ?`)
    .get(monthStart) as { expenses: number };

  const recentCustomers = db
    .prepare(
      `SELECT customers.id, customers.name, customers.phone, customers.customer_type, customers.created_at,
              ${CUSTOMER_VEHICLE_LIST_SQL}
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
              invoices.payment_method,
              COALESCE(invoices.service_date, date(invoices.created_at)) AS service_date,
              invoices.created_at,
              customers.name AS customer_name, customers.customer_type, customers.phone AS customer_phone,
              vehicles.vehicle_number, vehicles.vehicle_model, vehicles.driver_name, vehicles.driver_phone
       FROM invoices
       JOIN customers ON customers.id = invoices.customer_id
       LEFT JOIN vehicles ON vehicles.id = invoices.vehicle_id
       ORDER BY invoices.service_date DESC, invoices.created_at DESC
       LIMIT ?`
    )
    .all(RECENT_LIMIT);

  const outstandingCredit = db
    .prepare(
      `SELECT invoices.id, invoices.total_amount, invoices.paid_amount, invoices.payment_status,
              COALESCE(invoices.service_date, date(invoices.created_at)) AS service_date,
              invoices.created_at, customers.name AS customer_name, customers.customer_type,
              customers.phone AS customer_phone,
              vehicles.vehicle_number, vehicles.vehicle_model, vehicles.driver_name, vehicles.driver_phone
       FROM invoices
       JOIN customers ON customers.id = invoices.customer_id
       LEFT JOIN vehicles ON vehicles.id = invoices.vehicle_id
       WHERE invoices.payment_method = 'credit' AND invoices.payment_status != 'paid'
       ORDER BY invoices.service_date DESC, invoices.created_at DESC
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
    creditOutstanding: Math.max(0, credit_outstanding_all),
    creditInvoicesThisMonth: credit_invoice_count_month,
    creditOutstandingThisMonth: Math.max(0, credit_outstanding),
    recentCustomers,
    recentInvoices,
    outstandingCredit,
    recentExpenses,
  });
});
