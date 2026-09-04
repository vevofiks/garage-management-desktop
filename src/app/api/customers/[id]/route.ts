import { requireUser } from '@/lib/auth';
import { ok, badRequest, notFound, withErrorHandling } from '@/lib/http';
import { customerSchema, normalizeCustomerInput } from '@/lib/schemas/customer';
import { logAudit } from '@/lib/audit';
import db from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

// History is a small, fixed-size summary for the customer detail page, not a
// paginated feed — capped so one customer with years of visits can't return
// an unbounded list.
const HISTORY_LIMIT = 50;

export const GET = withErrorHandling<Ctx>(async (req, { params }) => {
  await requireUser();
  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id)) return badRequest('Invalid ID');

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!customer) return notFound('Customer not found');

  const vehicles = db
    .prepare('SELECT id, vehicle_number, vehicle_model, created_at FROM vehicles WHERE customer_id = ? ORDER BY created_at ASC')
    .all(id);

  // The invoice *is* the service record now (no separate Services module),
  // so this is the customer's entire work history.
  const invoices = db
    .prepare(
      `SELECT invoices.id, invoices.total_amount, invoices.paid_amount, invoices.payment_status,
              invoices.created_at, invoices.notes,
              vehicles.vehicle_number, vehicles.vehicle_model
       FROM invoices
       LEFT JOIN vehicles ON vehicles.id = invoices.vehicle_id
       WHERE invoices.customer_id = ?
       ORDER BY invoices.created_at DESC
       LIMIT ?`
    )
    .all(id, HISTORY_LIMIT);

  // Visits/spend are lifetime totals (not capped by HISTORY_LIMIT above) —
  // a customer with a long history should still see their real totals even
  // though the lists below only show the most recent HISTORY_LIMIT rows.
  const { total_visits, total_spent } = db
    .prepare(
      `SELECT COUNT(*) AS total_visits, COALESCE(SUM(total_amount), 0) AS total_spent
       FROM invoices
       WHERE customer_id = ?`
    )
    .get(id) as { total_visits: number; total_spent: number };

  return ok({ ...customer, vehicles, invoices, total_visits, total_spent });
});

export const PATCH = withErrorHandling<Ctx>(async (req, { params }) => {
  await requireUser();
  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id)) return badRequest('Invalid ID');

  const body = await req.json();
  const { name, phone, address, vehicles } = customerSchema.parse(normalizeCustomerInput(body));

  const updateTx = db.transaction(() => {
    const result = db
      .prepare(`UPDATE customers SET name = ?, phone = ?, address = ? WHERE id = ?`)
      .run(name, phone || null, address || null, id);

    if (result.changes === 0) return false;

    // Fetch existing vehicle IDs for this customer
    const existingRows = db
      .prepare('SELECT id FROM vehicles WHERE customer_id = ?')
      .all(id) as { id: number }[];
    const existingIds = new Set(existingRows.map((r) => r.id));
    const keptIds = new Set<number>();

    const insertVehicle = db.prepare(
      'INSERT INTO vehicles (customer_id, vehicle_number, vehicle_model) VALUES (?, ?, ?)'
    );
    const updateVehicle = db.prepare(
      'UPDATE vehicles SET vehicle_number = ?, vehicle_model = ? WHERE id = ? AND customer_id = ?'
    );

    if (vehicles && vehicles.length > 0) {
      for (const v of vehicles) {
        if (!v.vehicle_number && !v.vehicle_model) continue;
        if (v.id && existingIds.has(v.id)) {
          updateVehicle.run(v.vehicle_number || null, v.vehicle_model || null, v.id, id);
          keptIds.add(v.id);
        } else {
          const info = insertVehicle.run(id, v.vehicle_number || null, v.vehicle_model || null);
          keptIds.add(info.lastInsertRowid as number);
        }
      }
    }

    const deleteVehicle = db.prepare('DELETE FROM vehicles WHERE id = ? AND customer_id = ?');
    for (const r of existingRows) {
      if (!keptIds.has(r.id)) {
        try {
          deleteVehicle.run(r.id, id);
        } catch {
          // If linked to an invoice, foreign key prevents orphaned deletion
        }
      }
    }

    return true;
  });

  const updated = updateTx();
  if (!updated) return notFound('Customer not found');

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as Record<string, unknown>;
  const updatedVehicles = db
    .prepare('SELECT id, vehicle_number, vehicle_model, created_at FROM vehicles WHERE customer_id = ? ORDER BY created_at ASC')
    .all(id);

  return ok({ ...customer, vehicles: updatedVehicles });
});

export const DELETE = withErrorHandling<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id)) return badRequest('Invalid ID');

  const existing = db.prepare('SELECT name FROM customers WHERE id = ?').get(id) as
    | { name: string }
    | undefined;
  if (!existing) return notFound('Customer not found');

  try {
    const result = db.prepare('DELETE FROM customers WHERE id = ?').run(id);
    if (result.changes === 0) return notFound('Customer not found');
    logAudit(user, 'customer.deleted', `Deleted customer "${existing.name}"`);
    return ok({ success: true });
  } catch (error) {
    // FK enforcement (db.ts) rejects the delete instead of orphaning rows
    // when this customer still has invoices. Vehicles are owned by the
    // customer (ON DELETE CASCADE) and are removed automatically.
    if (error instanceof Error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      return badRequest('This customer has invoice history and cannot be deleted');
    }
    throw error;
  }
});
