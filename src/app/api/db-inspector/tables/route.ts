import db from '@/lib/db';

export async function GET() {
  try {
    const tableNames = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      )
      .all() as { name: string }[];

    const tables = tableNames.map(({ name }) => {
      const rowCount = (
        db.prepare(`SELECT COUNT(*) as count FROM "${name}"`).get() as { count: number }
      ).count;

      const columns = db.prepare(`PRAGMA table_info("${name}")`).all();
      const foreignKeys = db.prepare(`PRAGMA foreign_key_list("${name}")`).all();
      const indexes = db.prepare(`PRAGMA index_list("${name}")`).all();

      return { name, rowCount, columns, foreignKeys, indexes };
    });

    return Response.json({ tables });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
