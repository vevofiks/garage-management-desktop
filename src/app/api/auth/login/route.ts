import { cookies } from 'next/headers';
import db from '@/lib/db';
import { verifyPassword, createSession } from '@/lib/auth';
import { ok, unauthorized, withErrorHandling } from '@/lib/http';
import { loginSchema } from '@/lib/schemas/auth';

type UserRow = { id: number; password: string; role: 'admin' | 'staff' };

export const POST = withErrorHandling(async (req) => {
  const body = await req.json();
  const { username, password } = loginSchema.parse(body);

  const user = db
    .prepare('SELECT id, password, role FROM users WHERE username = ?')
    .get(username) as UserRow | undefined;

  if (!user || !verifyPassword(password, user.password)) {
    return unauthorized('Invalid username or password');
  }

  const token = createSession(user.id);

  const cookieStore = await cookies();
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    // No maxAge — session lasts until explicit logout (suitable for a desktop app).
  });

  return ok({ id: user.id, username, role: user.role });
});
