/**
 * src/app/api/test/route.ts
 *
 * Smoke-test endpoint — confirms:
 *   1. Next.js API routes are working
 *   2. SQLite database is reachable and the schema bootstrapped correctly
 *
 * GET /api/test → returns DB status + list of tables
 *
 * Remove or replace this route once the real feature APIs are in place.
 */

import db from '@/lib/db';

export async function GET() {
  try {
    // Query sqlite_master to verify tables were created
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[];

    return Response.json({
      status: 'ok',
      message: 'Database connection successful',
      tables: tables.map((t) => t.name),
    });
  } catch (error) {
    console.error('[api/test] DB error:', error);
    return Response.json(
      { status: 'error', message: String(error) },
      { status: 500 }
    );
  }
}
