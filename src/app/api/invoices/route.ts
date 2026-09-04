import { requireUser } from '@/lib/auth';
import { ok, badRequest, paginated, parsePagination, withErrorHandling } from '@/lib/http';
import { createInvoiceSchema, normalizeCreateInvoiceInput } from '@/lib/schemas/invoice';
import { computeInvoiceTotal, derivePaymentStatus } from '@/lib/invoice-totals';
import { logAudit } from '@/lib/audit';
import db from '@/lib/db';

export const GET = withErrorHandling(async (req) => {
  await requireUser();

  const q = req.nextUrl.searchParams.get('q')?.trim();
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  const customerId = req.nextUrl.searchParams.get('customer_id');
  const status = req.nextUrl.searchParams.get('status');
  const { page, pageSize, offset } = parsePagination(req.nextUrl.searchParams);

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (q) {
    // Matches customer name, typed invoice number ("INV-12"/"12"), or vehicle number/model
    const idPart = q.toUpperCase().startsWith('INV-') ? q.slice(4) : q;
    conditions.push(
      '(customers.name LIKE ? OR CAST(invoices.id AS TEXT) = ? OR vehicles.vehicle_number LIKE ? OR vehicles.vehicle_model LIKE ?)'
    );
    params.push(`%${q}%`, idPart, `%${q}%`, `%${q}%`);
  }
  if (from) {
    conditions.push('invoices.created_at >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('invoices.created_at <= ?');
    params.push(`${to} 23:59:59`);
  }
  if (customerId) {
    conditions.push('invoices.customer_id = ?');
    params.push(Number(customerId));
  }
  if (status && status !== 'all') {
    conditions.push('invoices.payment_status = ?');
    params.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { total } = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM invoices
       JOIN customers ON customers.id = invoices.customer_id
       LEFT JOIN vehicles ON vehicles.id = invoices.vehicle_id
       ${where}`
    )
    .get(...params) as { total: number };

  const invoices = db
    .prepare(
      `SELECT
         invoices.id, invoices.customer_id, invoices.vehicle_id, invoices.total_amount, invoices.paid_amount,
         invoices.payment_status, invoices.created_at, customers.name AS customer_name,
         vehicles.vehicle_number, vehicles.vehicle_model
       FROM invoices
       JOIN customers ON customers.id = invoices.customer_id
       LEFT JOIN vehicles ON vehicles.id = invoices.vehicle_id
       ${where}
       ORDER BY invoices.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);

  return paginated(invoices, page, pageSize, total);
});

export const POST = withErrorHandling(async (req) => {
  const user = await requireUser();

  const body = await req.json();
  const { customer_id, vehicle_id, notes, items, paid_amount, payment_method, payment_method_note } =
    createInvoiceSchema.parse(normalizeCreateInvoiceInput(body));

  const customer = db.prepare('SELECT id, name FROM customers WHERE id = ?').get(customer_id) as
    | { id: number; name: string }
    | undefined;
  if (!customer) return badRequest('Customer not found');

  if (vehicle_id !== null) {
    const vehicle = db
      .prepare('SELECT id FROM vehicles WHERE id = ? AND customer_id = ?')
      .get(vehicle_id, customer_id);
    if (!vehicle) return badRequest('Vehicle not found for this customer');
  }

  const totalAmount = computeInvoiceTotal(items);
  const paymentStatus = derivePaymentStatus(totalAmount, paid_amount);

  const insertInvoice = db.prepare(
    `INSERT INTO invoices
       (customer_id, vehicle_id, notes, total_amount, paid_amount, payment_status, payment_method, payment_method_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertInvoiceItem = db.prepare(
    'INSERT INTO invoice_items (invoice_id, description, type, amount) VALUES (?, ?, ?, ?)'
  );

  const createInvoice = db.transaction(() => {
    const info = insertInvoice.run(
      customer_id,
      vehicle_id,
      notes || null,
      totalAmount,
      paid_amount,
      paymentStatus,
      payment_method,
      payment_method_note || null
    );
    const invoiceId = info.lastInsertRowid as number;
    for (const item of items) insertInvoiceItem.run(invoiceId, item.description, item.type, item.amount);
    return invoiceId;
  });

  const invoiceId = createInvoice();
  logAudit(user, 'invoice.created', `Created INV-${invoiceId} for ${customer.name}`);
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  return ok(invoice, { status: 201 });
});
