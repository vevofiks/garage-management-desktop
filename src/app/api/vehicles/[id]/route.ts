import { requireUser } from '@/lib/auth';
import { ok, badRequest, notFound, withErrorHandling } from '@/lib/http';
import { vehicleSchema, normalizeVehicleInput, vehicleSchemaForCustomerType } from '@/lib/schemas/vehicle';
import db from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandling<Ctx>(async (req, { params }) => {
  await requireUser();
  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id)) return badRequest('Invalid ID');

  const body = await req.json();
  const vehicleRow = db
    .prepare(
      `SELECT vehicles.customer_id, customers.customer_type
       FROM vehicles
       JOIN customers ON customers.id = vehicles.customer_id
       WHERE vehicles.id = ?`
    )
    .get(id) as { customer_id: number; customer_type: string } | undefined;
  if (!vehicleRow) return notFound('Vehicle not found');

  const customerType = vehicleRow.customer_type === 'company' ? 'company' : 'individual';
  const { driver_name, driver_phone, vehicle_number, vehicle_model } = vehicleSchemaForCustomerType(
    customerType
  ).parse(normalizeVehicleInput(body));

  const result = db
    .prepare(
      'UPDATE vehicles SET vehicle_number = ?, vehicle_model = ?, driver_name = ?, driver_phone = ? WHERE id = ?'
    )
    .run(
      vehicle_number || null,
      vehicle_model || null,
      customerType === 'company' ? driver_name || null : null,
      customerType === 'company' ? driver_phone || null : null,
      id
    );

  if (result.changes === 0) return notFound('Vehicle not found');

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
  return ok(vehicle);
});

export const DELETE = withErrorHandling<Ctx>(async (req, { params }) => {
  await requireUser();
  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id)) return badRequest('Invalid ID');

  try {
    const result = db.prepare('DELETE FROM vehicles WHERE id = ?').run(id);
    if (result.changes === 0) return notFound('Vehicle not found');
    return ok({ success: true });
  } catch (error) {
    // FK enforcement (db.ts) rejects the delete instead of orphaning
    // invoices that reference this vehicle.
    if (error instanceof Error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      return badRequest('This vehicle has invoice history and cannot be deleted');
    }
    throw error;
  }
});
