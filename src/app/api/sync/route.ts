/**
 * src/app/api/sync/route.ts
 *
 * API endpoints for offline-first cloud synchronization.
 */

import { NextRequest } from 'next/server';
import { ok, badRequest, withErrorHandling } from '@/lib/http';
import { getSyncStatus, syncWithCloud } from '@/lib/sync';
import { testCloudConnection } from '@/lib/cloud-db';
import { setSetting } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const GET = withErrorHandling(async () => {
  await requireUser();
  const status = getSyncStatus();
  return ok(status);
});

export const POST = withErrorHandling(async () => {
  await requireUser();
  const result = await syncWithCloud();
  return ok(result);
});

export const PUT = withErrorHandling(async (req: NextRequest) => {
  const user = await requireUser();
  const body = (await req.json()) as { testOnly?: boolean; cloudUrl?: string };

  if (body.testOnly) {
    const res = await testCloudConnection(body.cloudUrl);
    return ok(res);
  }

  // Only admin can reconfigure database URL
  if (user.role !== 'admin') {
    return badRequest('Only administrators can configure cloud database settings.');
  }

  if (typeof body.cloudUrl !== 'string') {
    return badRequest('Invalid cloud database URL provided.');
  }

  const trimmed = body.cloudUrl.trim();
  if (trimmed && !trimmed.startsWith('postgres://') && !trimmed.startsWith('postgresql://')) {
    return badRequest('Cloud database URL must start with postgresql:// or postgres://');
  }

  setSetting('cloud_database_url', trimmed);
  const testRes = await testCloudConnection(trimmed);

  return ok({
    success: true,
    cloudUrl: trimmed,
    testResult: testRes,
  });
});
