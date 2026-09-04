import { requireRole } from '@/lib/auth';
import { ok, withErrorHandling } from '@/lib/http';
import db from '@/lib/db';

const LIST_LIMIT = 100;

export const GET = withErrorHandling(async () => {
  await requireRole('admin');

  const logs = db
    .prepare(
      `SELECT id, username, action, description, created_at
       FROM audit_logs
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(LIST_LIMIT);

  return ok(logs);
});
