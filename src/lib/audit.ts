/**
 * src/lib/audit.ts
 *
 * Records "who did what" for actions worth an audit trail — destructive
 * ones especially (deleting an invoice, a customer, ...), plus creation of
 * the same records. Call this from inside the route handler, after the
 * underlying operation has actually succeeded (never speculatively before).
 */

import db from './db';

export function logAudit(
  user: { id: number; username: string },
  action: string,
  description: string
) {
  try {
    db.prepare(
      'INSERT INTO audit_logs (user_id, username, action, description) VALUES (?, ?, ?, ?)'
    ).run(user.id, user.username, action, description);
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
