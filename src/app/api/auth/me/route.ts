import { getSessionUser } from '@/lib/auth';
import { ok, unauthorized, withErrorHandling } from '@/lib/http';

export const GET = withErrorHandling(async () => {
  const user = await getSessionUser();

  if (!user) {
    return unauthorized('Not authenticated');
  }

  return ok(user);
});
