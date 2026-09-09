import { requireUser } from '@/lib/auth';
import { ok, badRequest, notFound, withErrorHandling } from '@/lib/http';
import { updateInvoiceSchema, createInvoiceSchema, normalizeCreateInvoiceInput } from '@/lib/schemas/invoice';
import { computeInvoiceTotal, derivePaymentStatus } from '@/lib/invoice-totals';
import { logAudit } from '@/lib/audit';
import db from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling<Ctx>(async (req, { params }) => {
  await requireUser();
  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id)) return badRequest('Invalid ID');

  // Every detail the billing screen needs in one round trip — customer
  // contact + vehicle info included directly, not left for the frontend to
  // stitch together from a second call to /api/customers/[id].
  const invoice = db
    .prepare(
      `SELECT
         invoices.id, invoices.customer_id, invoices.vehicle_id, invoices.notes,
         invoices.total_amount, invoices.paid_amount, invoices.payment_status,
         invoices.payment_method, invoices.payment_method_note, invoices.created_at,
         COALESCE(invoices.service_date, date(invoices.created_at)) AS service_date,
         customers.name AS customer_name, customers.phone AS customer_phone,
         customers.address AS customer_address, customers.customer_type,
         vehicles.vehicle_number, vehicles.vehicle_model,
         vehicles.driver_name, vehicles.driver_phone
       FROM invoices
       JOIN customers ON customers.id = invoices.customer_id
       LEFT JOIN vehicles ON vehicles.id = invoices.vehicle_id
       WHERE invoices.id = ?`
    )
    .get(id);
  if (!invoice) return notFound('Invoice not found');

  const items = db
    .prepare('SELECT id, description, type, amount FROM invoice_items WHERE invoice_id = ? ORDER BY id')
    .all(id);

  return ok({ ...(invoice as object), items });
});

export const PATCH = withErrorHandling<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id)) return badRequest('Invalid ID');

  const body = await req.json();
  const isFullUpdate = (body as Record<string, unknown>).customer_id !== undefined;

  if (isFullUpdate) {
    const {
      customer_id,
      vehicle_id,
      service_date,
      notes,
      items,
      paid_amount,
      payment_method,
      payment_method_note,
    } = createInvoiceSchema.parse(normalizeCreateInvoiceInput(body));

    const existing = db.prepare('SELECT id FROM invoices WHERE id = ?').get(id);
    if (!existing) return notFound('Invoice not found');

    const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(customer_id);
    if (!customer) return badRequest('Customer not found');

    if (vehicle_id) {
      const vehicle = db
        .prepare('SELECT id FROM vehicles WHERE id = ? AND customer_id = ?')
        .get(vehicle_id, customer_id);
      if (!vehicle) return badRequest('Vehicle does not belong to this customer');
    }

    const vehicleCount = db
      .prepare('SELECT COUNT(*) AS count FROM vehicles WHERE customer_id = ?')
      .get(customer_id) as { count: number };
    if (vehicleCount.count > 1 && !vehicle_id) {
      return badRequest('Select a vehicle for this customer');
    }

    const totalAmount = computeInvoiceTotal(items);
    const status = derivePaymentStatus(totalAmount, paid_amount);

    const deleteItems = db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?');
    const insertItem = db.prepare(
      'INSERT INTO invoice_items (invoice_id, description, type, amount) VALUES (?, ?, ?, ?)'
    );

    const applyFullUpdate = db.transaction(() => {
      deleteItems.run(id);
      for (const item of items) insertItem.run(id, item.description, item.type, item.amount);

      db.prepare(
        `UPDATE invoices SET
           customer_id = ?, vehicle_id = ?, service_date = ?, notes = ?,
           total_amount = ?, paid_amount = ?, payment_status = ?,
           payment_method = ?, payment_method_note = ?
         WHERE id = ?`
      ).run(
        customer_id,
        vehicle_id,
        service_date,
        notes || null,
        totalAmount,
        paid_amount,
        status,
        payment_method,
        payment_method_note || null,
        id
      );
    });

    applyFullUpdate();
    logAudit(user, 'invoice.updated', `Updated INV-${id}`);

    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    const updatedItems = db
      .prepare('SELECT id, description, type, amount FROM invoice_items WHERE invoice_id = ? ORDER BY id')
      .all(id);
    return ok({ ...(invoice as object), items: updatedItems });
  }

  const { items, service_date, paid_amount, payment_method, payment_method_note, notes } = updateInvoiceSchema.parse(body);

  if (
    items === undefined &&
    service_date === undefined &&
    paid_amount === undefined &&
    payment_method === undefined &&
    payment_method_note === undefined &&
    notes === undefined
  ) {
    return badRequest('Nothing to update');
  }

  const current = db
    .prepare('SELECT total_amount, paid_amount, payment_method, payment_method_note FROM invoices WHERE id = ?')
    .get(id) as
    | { total_amount: number; paid_amount: number; payment_method: string; payment_method_note: string | null }
    | undefined;
  if (!current) return notFound('Invoice not found');

  // 'other' always needs a note saying what it actually was — check against
  // whichever of the two ends up set (the incoming value, or the value
  // already on the row if this PATCH doesn't touch it).
  const resultingMethod = payment_method ?? current.payment_method;
  const resultingNote = payment_method_note ?? current.payment_method_note;
  if (resultingMethod === 'other' && !resultingNote) {
    return badRequest('Describe the payment method (e.g. "Half cash, half GPay")');
  }

  // Amount paid can never exceed the invoice total — check against whichever
  // total ends up in effect (items, if this PATCH replaces them; otherwise
  // the row's existing total_amount).
  const resultingTotal = items ? computeInvoiceTotal(items) : current.total_amount;
  const resultingPaidAmount = paid_amount ?? current.paid_amount;
  if (resultingPaidAmount > resultingTotal) {
    return badRequest('Amount paid cannot be more than the invoice total');
  }

  const deleteItems = db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?');
  const insertItem = db.prepare(
    'INSERT INTO invoice_items (invoice_id, description, type, amount) VALUES (?, ?, ?, ?)'
  );

  // Items: replace-all (no stable way to diff "same row, edited" vs "new
  // row" across a save). Payment status is always re-derived from
  // total/paid here, never trusted from the client, so the two columns
  // can't drift out of sync.
  const applyUpdate = db.transaction(() => {
    let totalAmount = current.total_amount;
    if (items) {
      totalAmount = computeInvoiceTotal(items);
      deleteItems.run(id);
      for (const item of items) insertItem.run(id, item.description, item.type, item.amount);
    }
    const paidAmount = paid_amount ?? current.paid_amount;
    const status = derivePaymentStatus(totalAmount, paidAmount);

    const setClauses = ['total_amount = ?', 'paid_amount = ?', 'payment_status = ?'];
    const setParams: (string | number | null)[] = [totalAmount, paidAmount, status];
    if (payment_method !== undefined) {
      setClauses.push('payment_method = ?');
      setParams.push(payment_method);
    }
    if (payment_method_note !== undefined) {
      setClauses.push('payment_method_note = ?');
      setParams.push(payment_method_note || null);
    }
    if (notes !== undefined) {
      setClauses.push('notes = ?');
      setParams.push(notes || null);
    }
    if (service_date !== undefined) {
      setClauses.push('service_date = ?');
      setParams.push(service_date);
    }
    db.prepare(`UPDATE invoices SET ${setClauses.join(', ')} WHERE id = ?`).run(...setParams, id);
  });

  applyUpdate();

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  const updatedItems = db
    .prepare('SELECT id, description, type, amount FROM invoice_items WHERE invoice_id = ? ORDER BY id')
    .all(id);
  return ok({ ...(invoice as object), items: updatedItems });
});

export const DELETE = withErrorHandling<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id)) return badRequest('Invalid ID');

  // invoice_items has no ON DELETE CASCADE (unlike service_items did) — it's
  // owned by the invoice the same way, so clear its own rows first in the
  // same transaction rather than adding a cascade for a path only this
  // route needs.
  const deleteInvoice = db.transaction(() => {
    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id);
    return db.prepare('DELETE FROM invoices WHERE id = ?').run(id);
  });

  const result = deleteInvoice();
  if (result.changes === 0) return notFound('Invoice not found');
  logAudit(user, 'invoice.deleted', `Deleted INV-${id}`);
  return ok({ success: true });
});
