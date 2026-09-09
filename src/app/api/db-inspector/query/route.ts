import db from '@/lib/db';

export async function POST(request: Request) {
  const { sql } = (await request.json()) as { sql: string };

  if (!sql?.trim()) {
    return Response.json({ error: 'No SQL provided' }, { status: 400 });
  }

  const start = performance.now();
  try {
    const trimmed = sql.trim().toUpperCase();
    const isRead =
      trimmed.startsWith('SELECT') ||
      trimmed.startsWith('PRAGMA') ||
      trimmed.startsWith('EXPLAIN') ||
      trimmed.startsWith('WITH');

    if (isRead) {
      const rows = db.prepare(sql).all() as Record<string, unknown>[];
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      return Response.json({
        rows,
        columns,
        rowsAffected: null,
        executionTime: +(performance.now() - start).toFixed(2),
      });
    } else {
      const result = db.prepare(sql).run();
      return Response.json({
        rows: [],
        columns: [],
        rowsAffected: result.changes,
        lastInsertRowid: Number(result.lastInsertRowid),
        executionTime: +(performance.now() - start).toFixed(2),
      });
    }
  } catch (error) {
    return Response.json(
      { error: String(error), executionTime: +(performance.now() - start).toFixed(2) },
      { status: 400 }
    );
  }
}
