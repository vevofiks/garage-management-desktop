import { requireUser } from '@/lib/auth';
import { ok, badRequest, notFound, withErrorHandling } from '@/lib/http';
import { vehicleSchema, normalizeVehicleInput, vehicleSchemaForCustomerType } from '@/lib/schemas/vehicle';
import db from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling<Ctx>(async (req, { params }) => {
  await requireUser();
  const customerId = parseInt((await params).id, 10);
  if (Number.isNaN(customerId)) return badRequest('Invalid ID');

  const vehicles = db
    .prepare('SELECT * FROM vehicles WHERE customer_id = ? ORDER BY created_at ASC')
    .all(customerId);
  return ok(vehicles);
});

export const POST = withErrorHandling<Ctx>(async (req, { params }) => {
  await requireUser();
  const customerId = parseInt((await params).id, 10);
  if (Number.isNaN(customerId)) return badRequest('Invalid ID');

  const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId);
  if (!customer) return notFound('Customer not found');

  const body = await req.json();
  const customerRow = db.prepare('SELECT customer_type FROM customers WHERE id = ?').get(customerId) as
    | { customer_type: string }
    | undefined;
  const customerType = customerRow?.customer_type === 'company' ? 'company' : 'individual';
  const { driver_name, driver_phone, vehicle_number, vehicle_model } = vehicleSchemaForCustomerType(
    customerType
  ).parse(normalizeVehicleInput(body));

  const info = db
    .prepare(
      'INSERT INTO vehicles (customer_id, vehicle_number, vehicle_model, driver_name, driver_phone) VALUES (?, ?, ?, ?, ?)'
    )
    .run(
      customerId,
      vehicle_number || null,
      vehicle_model || null,
      customerType === 'company' ? driver_name || null : null,
      customerType === 'company' ? driver_phone || null : null
    );

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(info.lastInsertRowid);
  return ok(vehicle, { status: 201 });
});
