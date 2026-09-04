import { requireUser } from '@/lib/auth';
import { ok, badRequest, notFound, withErrorHandling } from '@/lib/http';
import { vehicleSchema, normalizeVehicleInput } from '@/lib/schemas/vehicle';
import db from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandling<Ctx>(async (req, { params }) => {
  await requireUser();
  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id)) return badRequest('Invalid ID');

  const body = await req.json();
  const { vehicle_number, vehicle_model } = vehicleSchema.parse(normalizeVehicleInput(body));

  const result = db
    .prepare('UPDATE vehicles SET vehicle_number = ?, vehicle_model = ? WHERE id = ?')
    .run(vehicle_number || null, vehicle_model || null, id);

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
