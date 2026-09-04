import { requireRole, hashPassword } from '@/lib/auth';
import { ok, badRequest, notFound, withErrorHandling } from '@/lib/http';
import { userSchema } from '@/lib/schemas/user';
import { logAudit } from '@/lib/audit';
import db from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandling<Ctx>(async (req, { params }) => {
  await requireRole('admin');
  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id)) return badRequest('Invalid ID');

  const body = await req.json();
  const { username, password, role } = userSchema.parse(body);

  try {
    if (password) {
      const hashed = hashPassword(password);
      db.prepare('UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?').run(username, hashed, role, id);
    } else {
      db.prepare('UPDATE users SET username = ?, role = ? WHERE id = ?').run(username, role, id);
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return badRequest('Username already exists');
    }
    throw error;
  }

  const updatedUser = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(id);
  if (!updatedUser) return notFound('User not found');
  return ok(updatedUser);
});

export const DELETE = withErrorHandling<Ctx>(async (req, { params }) => {
  const currentUser = await requireRole('admin');
  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id)) return badRequest('Invalid ID');

  if (currentUser.id === id) {
    return badRequest('Cannot delete your own account');
  }

  const existing = db.prepare('SELECT username FROM users WHERE id = ?').get(id) as
    | { username: string }
    | undefined;
  if (!existing) return notFound('User not found');

  const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (result.changes === 0) return notFound('User not found');

  logAudit(currentUser, 'user.deleted', `Deleted user "${existing.username}"`);
  return ok({ success: true });
});
