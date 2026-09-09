import db from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get('table');
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') ?? '50')));
  const sort = searchParams.get('sort');
  const dir = searchParams.get('dir') === 'desc' ? 'DESC' : 'ASC';
  const search = searchParams.get('search')?.trim() ?? '';

  if (!table) return Response.json({ error: 'table param required' }, { status: 400 });

  // Validate table exists
  const known = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get(table);
  if (!known) return Response.json({ error: 'table not found' }, { status: 404 });

  const offset = (page - 1) * limit;
  const colDefs = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
  const colNames = colDefs.map((c) => c.name);

  let where = '';
  const params: string[] = [];
  if (search && colNames.length > 0) {
    const clauses = colNames.map(() => `CAST(? AS TEXT) LIKE ?`).map((_, i) => {
      params.push(colNames[i], `%${search}%`);
      return `CAST("${colNames[i]}" AS TEXT) LIKE ?`;
    });
    // rebuild properly
    params.length = 0;
    const likeVal = `%${search}%`;
    const likeClauses = colNames.map((c) => {
      params.push(likeVal);
      return `CAST("${c}" AS TEXT) LIKE ?`;
    });
    where = `WHERE ${likeClauses.join(' OR ')}`;
  }

  const countRow = db
    .prepare(`SELECT COUNT(*) as count FROM "${table}" ${where}`)
    .get(...params) as { count: number };
  const total = countRow.count;

  let query = `SELECT * FROM "${table}" ${where}`;
  if (sort && colNames.includes(sort)) query += ` ORDER BY "${sort}" ${dir}`;
  query += ` LIMIT ${limit} OFFSET ${offset}`;

  const rows = db.prepare(query).all(...params);

  return Response.json({ rows, columns: colNames, total, page, limit });
}
