'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ColInfo { cid: number; name: string; type: string; notnull: number; dflt_value: string | null; pk: number; }
interface FKInfo { id: number; table: string; from: string; to: string; }
interface TableInfo { name: string; rowCount: number; columns: ColInfo[]; foreignKeys: FKInfo[]; }
interface DataResult { rows: Record<string, unknown>[]; columns: string[]; total: number; page: number; limit: number; }
interface QueryResult { rows: Record<string, unknown>[]; columns: string[]; rowsAffected: number | null; lastInsertRowid?: number; executionTime: number; error?: string; }

// ─── Design tokens ───────────────────────────────────────────────────────────
const C = {
  base: '#0d1117', surface: '#161b22', elevated: '#21262d', hover: '#2d333b',
  border: '#30363d', text: '#e6edf3', muted: '#8b949e', faint: '#484f58',
  accent: '#58a6ff', accentBg: '#1d3760',
  green: '#3fb950', greenBg: '#1a3a2a',
  yellow: '#d29922', yellowBg: '#2d2000',
  red: '#f85149', redBg: '#3d1212',
  purple: '#d2a8ff', purpleBg: '#2d1a4a',
};

function typeBadge(type: string): { bg: string; color: string } {
  const t = type.toUpperCase();
  if (t.includes('INT')) return { bg: C.greenBg, color: C.green };
  if (t.includes('REAL') || t.includes('FLOAT') || t.includes('NUMERIC') || t.includes('DOUBLE'))
    return { bg: C.yellowBg, color: C.yellow };
  if (t.includes('TEXT') || t.includes('CHAR') || t.includes('CLOB') || t.includes('VARC'))
    return { bg: C.accentBg, color: C.accent };
  if (t.includes('BLOB')) return { bg: C.purpleBg, color: C.purple };
  return { bg: C.elevated, color: C.muted };
}

function fmtCell(val: unknown): { text: string; style: React.CSSProperties } {
  if (val === null || val === undefined)
    return { text: 'NULL', style: { color: C.faint, fontStyle: 'italic' } };
  if (typeof val === 'number')
    return { text: String(val), style: { color: C.green, textAlign: 'right' } };
  const s = String(val);
  if (s.length > 80)
    return { text: s.slice(0, 80) + '…', style: { color: C.text } };
  return { text: s, style: { color: C.text } };
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function DBInspectorPage() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'data' | 'schema' | 'query'>('data');
  const [data, setData] = useState<DataResult | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sort, setSort] = useState<string | null>(null);
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState('');
  const [sql, setSql] = useState('SELECT * FROM customers LIMIT 10;');
  const [qResult, setQResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [qLoading, setQLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchTables = useCallback(async () => {
    const res = await fetch('/api/db-inspector/tables');
    const json = await res.json();
    if (json.tables) setTables(json.tables);
  }, []);

  const fetchData = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    const params = new URLSearchParams({
      table: selected, page: String(page), limit: String(limit),
      ...(sort ? { sort, dir } : {}),
      ...(search ? { search } : {}),
    });
    const res = await fetch(`/api/db-inspector/data?${params}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [selected, page, limit, sort, dir, search]);

  const runQuery = useCallback(async () => {
    setQLoading(true);
    const res = await fetch('/api/db-inspector/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql }),
    });
    const json = await res.json();
    setQResult(json);
    setQLoading(false);
    fetchTables(); // refresh counts after writes
  }, [sql, fetchTables]);

  useEffect(() => { fetchTables(); }, [fetchTables]);
  useEffect(() => {
    if (selected && tab === 'data') fetchData();
  }, [selected, tab, page, limit, sort, dir]);

  // Search with debounce
  useEffect(() => {
    if (!selected || tab !== 'data') return;
    const t = setTimeout(() => { setPage(1); fetchData(); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const handleSort = (col: string) => {
    if (sort === col) setDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSort(col); setDir('asc'); }
    setPage(1);
  };

  const handleSelect = (name: string) => {
    setSelected(name); setTab('data');
    setPage(1); setSort(null); setSearch(''); setData(null);
  };

  const selectedTableInfo = tables.find(t => t.name === selected);

  // ── Render helpers ──────────────────────────────────────────────────────────
  const DataTable = ({ result }: { result: DataResult }) => (
    <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
      {loading && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,17,23,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
          <Spinner />
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'ui-monospace,Cascadia Code,Fira Code,Consolas,monospace', fontSize: 12 }}>
        <thead>
          <tr style={{ background: C.elevated, position: 'sticky', top: 0, zIndex: 5 }}>
            <th style={{ ...tdStyle, color: C.faint, width: 40, textAlign: 'center' }}>#</th>
            {result.columns.map(col => (
              <th key={col} onClick={() => handleSort(col)}
                style={{ ...tdStyle, color: C.muted, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {col}
                  {sort === col ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.length === 0 ? (
            <tr><td colSpan={result.columns.length + 1} style={{ ...tdStyle, textAlign: 'center', color: C.muted, padding: 32 }}>No rows found</td></tr>
          ) : result.rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)' }}
              onMouseEnter={e => (e.currentTarget.style.background = C.hover)}
              onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)')}>
              <td style={{ ...tdStyle, color: C.faint, textAlign: 'center' }}>{(page - 1) * limit + i + 1}</td>
              {result.columns.map(col => {
                const { text, style } = fmtCell(row[col]);
                return <td key={col} style={{ ...tdStyle, ...style, maxWidth: 300 }} title={String(row[col] ?? '')}>{text}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const SchemaView = ({ info }: { info: TableInfo }) => (
    <div style={{ padding: 24, overflow: 'auto', flex: 1 }}>
      <h3 style={{ color: C.text, marginBottom: 16, fontSize: 14, fontWeight: 600 }}>Columns</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: C.elevated }}>
            {['#', 'Name', 'Type', 'Constraints', 'Default', 'References'].map(h => (
              <th key={h} style={{ ...tdStyle, color: C.muted, fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {info.columns.map((col) => {
            const badge = typeBadge(col.type || 'TEXT');
            const fk = info.foreignKeys.find(f => f.from === col.name);
            return (
              <tr key={col.cid}>
                <td style={{ ...tdStyle, color: C.faint }}>{col.cid}</td>
                <td style={{ ...tdStyle, color: C.text, fontFamily: 'monospace', fontWeight: col.pk ? 700 : 400 }}>
                  {col.pk ? '🔑 ' : ''}{col.name}
                </td>
                <td style={tdStyle}>
                  <span style={{ background: badge.bg, color: badge.color, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontFamily: 'monospace' }}>
                    {col.type || 'BLOB'}
                  </span>
                </td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {col.pk ? <Badge bg={C.yellowBg} color={C.yellow}>PK</Badge> : null}
                    {col.notnull ? <Badge bg={C.redBg} color={C.red}>NOT NULL</Badge> : null}
                  </div>
                </td>
                <td style={{ ...tdStyle, color: C.muted, fontFamily: 'monospace', fontSize: 12 }}>{col.dflt_value ?? '—'}</td>
                <td style={{ ...tdStyle, color: C.accent, fontFamily: 'monospace', fontSize: 12 }}>
                  {fk ? `→ ${fk.table}.${fk.to}` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const QueryEditor = () => (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', padding: 16, gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <textarea ref={textareaRef} value={sql} onChange={e => setSql(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runQuery(); } }}
          placeholder="Enter SQL query… (Ctrl+Enter to run)"
          style={{
            flex: 1, minHeight: 120, background: C.surface, border: `1px solid ${C.border}`,
            color: C.text, padding: '10px 12px', borderRadius: 8, resize: 'vertical',
            fontFamily: 'ui-monospace,Cascadia Code,Fira Code,Consolas,monospace',
            fontSize: 13, lineHeight: 1.6, outline: 'none',
          }} />
        <button onClick={runQuery} disabled={qLoading}
          style={{ ...btnStyle, background: C.accent, color: '#fff', opacity: qLoading ? 0.6 : 1 }}>
          {qLoading ? '...' : '▶ Run'}
        </button>
      </div>

      {qResult && (
        <div style={{ flex: 1, overflow: 'auto', borderRadius: 8, border: `1px solid ${C.border}` }}>
          {qResult.error ? (
            <div style={{ padding: 16, background: C.redBg, color: C.red, fontFamily: 'monospace', fontSize: 13, borderRadius: 8 }}>
              ✗ {qResult.error}
            </div>
          ) : (
            <>
              <div style={{ padding: '8px 14px', background: C.elevated, borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.muted, display: 'flex', gap: 16 }}>
                <span style={{ color: C.green }}>✓ Success</span>
                <span>{qResult.rows.length} rows returned</span>
                {qResult.rowsAffected != null && <span>{qResult.rowsAffected} rows affected</span>}
                <span>{qResult.executionTime}ms</span>
              </div>
              {qResult.columns.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: C.elevated }}>
                      {qResult.columns.map(c => <th key={c} style={{ ...tdStyle, color: C.muted }}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {qResult.rows.map((row, i) => (
                      <tr key={i}>
                        {qResult.columns.map(col => {
                          const { text, style } = fmtCell(row[col]);
                          return <td key={col} style={{ ...tdStyle, ...style }}>{text}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.base, color: C.text, fontFamily: 'system-ui, -apple-system, sans-serif', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', height: 52, background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <span style={{ fontSize: 18 }}>🗄️</span>
        <span style={{ fontWeight: 700, fontSize: 15, color: C.text }}>DB Inspector</span>
        <span style={{ background: C.elevated, color: C.muted, padding: '2px 10px', borderRadius: 20, fontSize: 11, fontFamily: 'monospace' }}>data/garage.db</span>
        <div style={{ marginLeft: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, boxShadow: `0 0 6px ${C.green}` }} />
          <span style={{ fontSize: 11, color: C.muted }}>Connected</span>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={fetchTables} style={{ ...btnStyle }}>↺ Refresh</button>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        <aside style={{ width: 220, background: C.surface, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ padding: '12px 12px 8px', fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Tables ({tables.length})
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {tables.map(t => (
              <div key={t.name} onClick={() => handleSelect(t.name)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 12px', cursor: 'pointer', borderLeft: `3px solid ${selected === t.name ? C.accent : 'transparent'}`,
                  background: selected === t.name ? C.hover : 'transparent',
                  transition: 'all 0.1s',
                }}
                onMouseEnter={e => { if (selected !== t.name) e.currentTarget.style.background = C.elevated; }}
                onMouseLeave={e => { if (selected !== t.name) e.currentTarget.style.background = 'transparent'; }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 13 }}>⬡</span>
                  <span style={{ fontSize: 13, color: selected === t.name ? C.accent : C.text }}>{t.name}</span>
                </div>
                <span style={{ fontSize: 11, background: C.elevated, color: C.muted, padding: '1px 6px', borderRadius: 8 }}>{t.rowCount}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* ── Main ── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: C.muted }}>
              <span style={{ fontSize: 48, opacity: 0.4 }}>🗄️</span>
              <p style={{ fontSize: 15 }}>Select a table from the sidebar</p>
            </div>
          ) : (
            <>
              {/* Tab bar + toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '0 16px', borderBottom: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
                {(['data', 'schema', 'query'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: '12px 16px',
                      color: tab === t ? C.accent : C.muted,
                      borderBottom: tab === t ? `2px solid ${C.accent}` : '2px solid transparent',
                      fontSize: 13, fontWeight: 500, textTransform: 'capitalize',
                    }}>{t === 'data' ? `Data (${selectedTableInfo?.rowCount ?? 0})` : t === 'query' ? 'SQL Query' : 'Schema'}</button>
                ))}

                {tab === 'data' && (
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search rows…"
                      style={{ background: C.elevated, border: `1px solid ${C.border}`, color: C.text, padding: '4px 10px', borderRadius: 6, fontSize: 12, outline: 'none', width: 180 }} />
                    <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                      style={{ background: C.elevated, border: `1px solid ${C.border}`, color: C.muted, padding: '4px 8px', borderRadius: 6, fontSize: 12 }}>
                      {[25, 50, 100, 250].map(n => <option key={n} value={n}>{n} rows</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* Tab content */}
              {tab === 'data' && data && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <DataTable result={data} />
                  {/* Pagination footer */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: C.surface, borderTop: `1px solid ${C.border}`, flexShrink: 0, fontSize: 12, color: C.muted }}>
                    <span>
                      Showing {Math.min((page - 1) * limit + 1, data.total)}–{Math.min(page * limit, data.total)} of <strong style={{ color: C.text }}>{data.total}</strong> rows
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => setPage(1)} disabled={page === 1} style={pageBtn(page === 1)}>«</button>
                      <button onClick={() => setPage(p => p - 1)} disabled={page === 1} style={pageBtn(page === 1)}>‹</button>
                      <span style={{ padding: '4px 10px', color: C.text }}>Page {page} of {totalPages}</span>
                      <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages} style={pageBtn(page >= totalPages)}>›</button>
                      <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} style={pageBtn(page >= totalPages)}>»</button>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'data' && !data && loading && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>
              )}

              {tab === 'schema' && selectedTableInfo && <SchemaView info={selectedTableInfo} />}
              {tab === 'query' && <QueryEditor />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Shared micro-components ─────────────────────────────────────────────────
function Badge({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return <span style={{ background: bg, color, padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{children}</span>;
}
function Spinner() {
  return <div style={{ width: 24, height: 24, border: `3px solid #30363d`, borderTopColor: '#58a6ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />;
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const tdStyle: React.CSSProperties = {
  padding: '6px 12px', borderBottom: '1px solid #21262d', textAlign: 'left', verticalAlign: 'middle',
};
const btnStyle: React.CSSProperties = {
  background: '#21262d', border: '1px solid #30363d', color: '#8b949e',
  padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500,
};
function pageBtn(disabled: boolean): React.CSSProperties {
  return { ...btnStyle, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'default' : 'pointer', padding: '4px 10px' };
}
