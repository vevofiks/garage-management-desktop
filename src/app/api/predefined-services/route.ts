import { requireUser } from '@/lib/auth';
import { ok, withErrorHandling } from '@/lib/http';
import { predefinedServiceSchema } from '@/lib/schemas/predefined-service';
import db from '@/lib/db';

export const GET = withErrorHandling(async () => {
  await requireUser();
  const services = db.prepare('SELECT id, name FROM predefined_services ORDER BY name').all();
  return ok(services);
});

export const POST = withErrorHandling(async (req) => {
  await requireUser();
  const body = await req.json();
  const { name } = predefinedServiceSchema.parse(body);

  try {
    const info = db.prepare('INSERT INTO predefined_services (name) VALUES (?)').run(name);
    const service = db.prepare('SELECT id, name FROM predefined_services WHERE id = ?').get(info.lastInsertRowid);
    return ok(service, { status: 201 });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      // The "add new" affordance is used by every staff member off the same
      // shared catalog — picking a name someone else just added a moment
      // ago should hand back that existing row, not error.
      const existing = db.prepare('SELECT id, name FROM predefined_services WHERE name = ?').get(name);
      return ok(existing);
    }
    throw error;
  }
});
