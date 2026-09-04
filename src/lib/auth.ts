import crypto from 'crypto';
import { cookies } from 'next/headers';
import db from './db';
import { UnauthorizedError, ForbiddenError } from './http';

// -- Password Hashing --

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

export function verifyPassword(password: string, hash: string): boolean {
  const [salt, key] = hash.split(':');
  if (!salt || !key) return false;
  
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return key === derivedKey;
}

// -- Session Management --

// Sentinel value: sessions live until the user explicitly logs out.
// The `expires_at` column is kept in the schema (no migration needed) but
// set to a date so far in the future it is effectively never reached.
const SESSION_NO_EXPIRE = '9999-12-31T23:59:59.000Z';

export function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');

  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(token, userId, SESSION_NO_EXPIRE);

  return token;
}

type SessionUserRow = {
  id: number;
  username: string;
  role: 'admin' | 'staff';
  expires_at: string;
};

export async function getSessionUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session')?.value;

  if (!sessionToken) return null;

  const session = db.prepare(`
    SELECT users.id, users.username, users.role, sessions.expires_at
    FROM sessions
    JOIN users ON sessions.user_id = users.id
    WHERE sessions.token = ?
  `).get(sessionToken) as SessionUserRow | undefined;

  if (!session) return null;

  // No expiry check — sessions are permanent until the user logs out.

  return {
    id: session.id,
    username: session.username,
    role: session.role
  };
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    throw new UnauthorizedError();
  }
  return user;
}

export async function requireRole(role: string | string[]) {
  const user = await requireUser();
  const allowed = Array.isArray(role) ? role : [role];
  if (!allowed.includes(user.role)) {
    throw new ForbiddenError();
  }
  return user;
}
