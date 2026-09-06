import { requireUser } from '@/lib/auth';
import { ok, paginated, parsePagination, withErrorHandling } from '@/lib/http';
import {
  customerSchema,
  normalizeCustomerInput,
  resolveStoredCustomerName,
  filterMeaningfulVehicleRows,
} from '@/lib/schemas/customer';
import { logAudit } from '@/lib/audit';
import { CUSTOMER_VEHICLE_LIST_SQL } from '@/lib/customer-list';
import db from '@/lib/db';

export const GET = withErrorHandling(async (req) => {
  await requireUser();

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const { page, pageSize, offset } = parsePagination(req.nextUrl.searchParams);

  const where = q
    ? `WHERE customers.name LIKE ? OR customers.phone LIKE ?
         OR customers.id IN (
           SELECT customer_id FROM vehicles
           WHERE vehicle_number LIKE ? OR vehicle_model LIKE ?
              OR driver_name LIKE ? OR driver_phone LIKE ?
         )`
    : '';
  const whereParams = q ? [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`] : [];

  const { total } = db
    .prepare(`SELECT COUNT(*) AS total FROM customers ${where}`)
    .get(...whereParams) as { total: number };

  // GROUP_CONCAT rolls each customer's vehicle numbers and models into one string for
  // the list/search view instead of joining rows into a cartesian product —
  // the full per-vehicle detail lives on the customer detail page.
  const customers = db
    .prepare(
      `SELECT customers.id, customers.name, customers.phone, customers.customer_type, customers.created_at,
              ${CUSTOMER_VEHICLE_LIST_SQL}
       FROM customers
       LEFT JOIN vehicles ON vehicles.customer_id = customers.id
       ${where}
       GROUP BY customers.id
       ORDER BY customers.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...whereParams, pageSize, offset);

  return paginated(customers, page, pageSize, total);
});

export const POST = withErrorHandling(async (req) => {
  const user = await requireUser();

  const body = await req.json();
  const { customer_type, name, phone, address, vehicles } = customerSchema.parse(normalizeCustomerInput(body));
  const storedName = resolveStoredCustomerName(customer_type, name, vehicles);
  const rows = filterMeaningfulVehicleRows(vehicles);

  const createCustomer = db.transaction(() => {
    const info = db
      .prepare(`INSERT INTO customers (name, phone, address, customer_type) VALUES (?, ?, ?, ?)`)
      .run(storedName, phone || null, address || null, customer_type);

    const customerId = info.lastInsertRowid as number;

    if (rows.length > 0) {
      const insertVehicle = db.prepare(
        'INSERT INTO vehicles (customer_id, vehicle_number, vehicle_model, driver_name, driver_phone) VALUES (?, ?, ?, ?, ?)'
      );
      for (const v of rows) {
        insertVehicle.run(
          customerId,
          v.vehicle_number || null,
          v.vehicle_model || null,
          customer_type === 'company' ? v.driver_name || null : null,
          customer_type === 'company' ? v.driver_phone || null : null
        );
      }
    }

    return customerId;
  });

  const customerId = createCustomer();

  logAudit(user, 'customer.created', `Created customer "${storedName}"`);
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  return ok(customer, { status: 201 });
});
