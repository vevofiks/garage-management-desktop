import { cookies } from 'next/headers';
import db from '@/lib/db';
import { ok, withErrorHandling } from '@/lib/http';

export const POST = withErrorHandling(async () => {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session')?.value;

  if (sessionToken) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(sessionToken);
  }

  cookieStore.delete('session');

  return ok({ success: true });
});
