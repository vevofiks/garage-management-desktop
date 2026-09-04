import { requireUser } from '@/lib/auth';
import { ok, paginated, parsePagination, withErrorHandling } from '@/lib/http';
import { customerSchema, normalizeCustomerInput } from '@/lib/schemas/customer';
import { logAudit } from '@/lib/audit';
import db from '@/lib/db';

export const GET = withErrorHandling(async (req) => {
  await requireUser();

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const { page, pageSize, offset } = parsePagination(req.nextUrl.searchParams);

  const where = q
    ? `WHERE customers.name LIKE ? OR customers.phone LIKE ?
         OR customers.id IN (SELECT customer_id FROM vehicles WHERE vehicle_number LIKE ? OR vehicle_model LIKE ?)`
    : '';
  const whereParams = q ? [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`] : [];

  const { total } = db
    .prepare(`SELECT COUNT(*) AS total FROM customers ${where}`)
    .get(...whereParams) as { total: number };

  // GROUP_CONCAT rolls each customer's vehicle numbers and models into one string for
  // the list/search view instead of joining rows into a cartesian product —
  // the full per-vehicle detail lives on the customer detail page.
  const customers = db
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
  const { name, phone, address, vehicles } = customerSchema.parse(normalizeCustomerInput(body));

  const createCustomer = db.transaction(() => {
    const info = db
      .prepare(`INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)`)
      .run(name, phone || null, address || null);

    const customerId = info.lastInsertRowid as number;

    if (vehicles && vehicles.length > 0) {
      const insertVehicle = db.prepare(
        'INSERT INTO vehicles (customer_id, vehicle_number, vehicle_model) VALUES (?, ?, ?)'
      );
      for (const v of vehicles) {
        if (v.vehicle_number || v.vehicle_model) {
          insertVehicle.run(customerId, v.vehicle_number || null, v.vehicle_model || null);
        }
      }
    }

    return customerId;
  });

  const customerId = createCustomer();

  logAudit(user, 'customer.created', `Created customer "${name}"`);
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  return ok(customer, { status: 201 });
});
