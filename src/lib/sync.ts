/**
 * src/lib/sync.ts
 *
 * Offline-First Cloud Synchronization Engine.
 * Manages bidirectional sync between local SQLite and remote Neon PostgreSQL.
 * Local SQLite always serves immediate UI requests without latency.
 */

import db, { getSetting, setSetting } from './db';
import { getCloudPool, bootstrapCloudDatabase, testCloudConnection } from './cloud-db';

export interface SyncResult {
  success: boolean;
  timestamp: string;
  pushedCount: number;
  pulledCount: number;
  error?: string;
  offline?: boolean;
}

let isSyncing = false;

export function getSyncStatus() {
  const lastSyncedAt = getSetting('last_synced_at', '');
  const lastSyncStatus = getSetting('last_sync_status', 'never');
  const lastSyncError = getSetting('last_sync_error', '');
  const cloudUrl = getSetting('cloud_database_url', '') || process.env.CLOUD_DATABASE_URL || process.env.DATABASE_URL || '';

  let host = 'Neon Cloud';
  try {
    if (cloudUrl) {
      const parsed = new URL(cloudUrl);
      host = parsed.hostname;
    }
  } catch (_) {}

  return {
    isSyncing,
    lastSyncedAt: lastSyncedAt || null,
    status: isSyncing ? 'syncing' : (lastSyncStatus as 'synced' | 'syncing' | 'offline' | 'error' | 'never'),
    error: lastSyncError || null,
    cloudConfigured: Boolean(cloudUrl && cloudUrl.startsWith('postgres')),
    cloudUrlHost: host,
  };
}

function ensureLocalColumns() {
  const tables = [
    'customers',
    'vehicles',
    'invoices',
    'invoice_items',
    'expenses',
    'expense_categories',
    'predefined_services',
    'users',
    'settings',
  ];
  for (const table of tables) {
    try {
      const cols = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
      if (!cols.some((c) => c.name === 'updated_at')) {
        db.exec(`ALTER TABLE "${table}" ADD COLUMN updated_at TEXT`);
        db.exec(`UPDATE "${table}" SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL`);
      }
    } catch (_) {}
  }
}

export async function syncWithCloud(): Promise<SyncResult> {
  if (isSyncing) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      pushedCount: 0,
      pulledCount: 0,
      error: 'A synchronization operation is already in progress.',
    };
  }

  isSyncing = true;
  const nowStr = new Date().toISOString();
  let pushedTotal = 0;
  let pulledTotal = 0;

  try {
    // 0. Ensure all local SQLite tables have sync tracking columns
    ensureLocalColumns();

    // 1. Check cloud reachability
    const health = await testCloudConnection();
    if (!health.ok) {
      setSetting('last_sync_status', 'offline');
      setSetting('last_sync_error', health.message);
      return {
        success: false,
        timestamp: nowStr,
        pushedCount: 0,
        pulledCount: 0,
        offline: true,
        error: health.message,
      };
    }

    const pool = getCloudPool();
    const client = await pool.connect();

    try {
      // 2. Ensure cloud database schema exists
      await bootstrapCloudDatabase(client);

      await client.query('BEGIN');

      // 3. PUSH local SQLite data -> Neon PostgreSQL
      // Users
      const localUsers = db.prepare('SELECT id, username, password, role, created_at, updated_at FROM users').all() as any[];
      for (const u of localUsers) {
        await client.query(
          `INSERT INTO users (id, username, password, role, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             username = EXCLUDED.username,
             password = EXCLUDED.password,
             role = EXCLUDED.role,
             updated_at = EXCLUDED.updated_at`,
          [u.id, u.username, u.password, u.role, u.created_at, u.updated_at || u.created_at]
        );
        pushedTotal++;
      }

      // Expense Categories
      const localCategories = db.prepare('SELECT id, name, created_at, updated_at FROM expense_categories').all() as any[];
      for (const cat of localCategories) {
        await client.query(
          `INSERT INTO expense_categories (id, name, created_at, updated_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             updated_at = EXCLUDED.updated_at`,
          [cat.id, cat.name, cat.created_at, cat.updated_at || cat.created_at]
        );
        pushedTotal++;
      }

      // Predefined Services
      const localServices = db.prepare('SELECT id, name, created_at, updated_at FROM predefined_services').all() as any[];
      for (const s of localServices) {
        await client.query(
          `INSERT INTO predefined_services (id, name, created_at, updated_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             updated_at = EXCLUDED.updated_at`,
          [s.id, s.name, s.created_at, s.updated_at || s.created_at]
        );
        pushedTotal++;
      }

      // Customers
      const localCustomers = db.prepare('SELECT id, name, phone, address, vehicle_number, vehicle_model, created_at, updated_at FROM customers').all() as any[];
      for (const c of localCustomers) {
        await client.query(
          `INSERT INTO customers (id, name, phone, address, vehicle_number, vehicle_model, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             phone = EXCLUDED.phone,
             address = EXCLUDED.address,
             vehicle_number = EXCLUDED.vehicle_number,
             vehicle_model = EXCLUDED.vehicle_model,
             updated_at = EXCLUDED.updated_at`,
          [c.id, c.name, c.phone, c.address, c.vehicle_number, c.vehicle_model, c.created_at, c.updated_at || c.created_at]
        );
        pushedTotal++;
      }

      // Vehicles
      const localVehicles = db.prepare('SELECT id, customer_id, vehicle_number, vehicle_model, created_at, updated_at FROM vehicles').all() as any[];
      for (const v of localVehicles) {
        await client.query(
          `INSERT INTO vehicles (id, customer_id, vehicle_number, vehicle_model, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             customer_id = EXCLUDED.customer_id,
             vehicle_number = EXCLUDED.vehicle_number,
             vehicle_model = EXCLUDED.vehicle_model,
             updated_at = EXCLUDED.updated_at`,
          [v.id, v.customer_id, v.vehicle_number, v.vehicle_model, v.created_at, v.updated_at || v.created_at]
        );
        pushedTotal++;
      }

      // Invoices
      const localInvoices = db.prepare('SELECT id, customer_id, vehicle_id, notes, total_amount, paid_amount, payment_status, payment_method, payment_method_note, service_date, created_at, updated_at FROM invoices').all() as any[];
      for (const inv of localInvoices) {
        await client.query(
          `INSERT INTO invoices (id, customer_id, vehicle_id, notes, total_amount, paid_amount, payment_status, payment_method, payment_method_note, service_date, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO UPDATE SET
             customer_id = EXCLUDED.customer_id,
             vehicle_id = EXCLUDED.vehicle_id,
             notes = EXCLUDED.notes,
             total_amount = EXCLUDED.total_amount,
             paid_amount = EXCLUDED.paid_amount,
             payment_status = EXCLUDED.payment_status,
             payment_method = EXCLUDED.payment_method,
             payment_method_note = EXCLUDED.payment_method_note,
             service_date = EXCLUDED.service_date,
             updated_at = EXCLUDED.updated_at`,
          [
            inv.id,
            inv.customer_id,
            inv.vehicle_id,
            inv.notes,
            inv.total_amount,
            inv.paid_amount,
            inv.payment_status,
            inv.payment_method,
            inv.payment_method_note,
            inv.service_date,
            inv.created_at,
            inv.updated_at || inv.created_at,
          ]
        );
        pushedTotal++;
      }

      // Invoice Items
      const localItems = db.prepare('SELECT id, invoice_id, description, type, amount, updated_at FROM invoice_items').all() as any[];
      for (const itm of localItems) {
        await client.query(
          `INSERT INTO invoice_items (id, invoice_id, description, type, amount, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             invoice_id = EXCLUDED.invoice_id,
             description = EXCLUDED.description,
             type = EXCLUDED.type,
             amount = EXCLUDED.amount,
             updated_at = EXCLUDED.updated_at`,
          [itm.id, itm.invoice_id, itm.description, itm.type, itm.amount, itm.updated_at || new Date().toISOString()]
        );
        pushedTotal++;
      }

      // Expenses
      const localExpenses = db.prepare('SELECT id, category_id, amount, notes, date, created_at, updated_at FROM expenses').all() as any[];
      for (const exp of localExpenses) {
        await client.query(
          `INSERT INTO expenses (id, category_id, amount, notes, date, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             category_id = EXCLUDED.category_id,
             amount = EXCLUDED.amount,
             notes = EXCLUDED.notes,
             date = EXCLUDED.date,
             updated_at = EXCLUDED.updated_at`,
          [exp.id, exp.category_id, exp.amount, exp.notes, exp.date, exp.created_at, exp.updated_at || exp.created_at]
        );
        pushedTotal++;
      }

      // Audit Logs (Append only)
      const localLogs = db.prepare('SELECT id, user_id, username, action, description, created_at FROM audit_logs').all() as any[];
      for (const lg of localLogs) {
        await client.query(
          `INSERT INTO audit_logs (id, user_id, username, action, description, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [lg.id, lg.user_id, lg.username, lg.action, lg.description, lg.created_at]
        );
        pushedTotal++;
      }

      // Settings (excluding local sync counters)
      const localSettings = db.prepare("SELECT key, value, updated_at FROM settings WHERE key NOT IN ('last_synced_at', 'last_sync_status', 'last_sync_error', 'last_weekly_backup_at')").all() as any[];
      for (const stg of localSettings) {
        await client.query(
          `INSERT INTO settings (key, value, updated_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (key) DO UPDATE SET
             value = EXCLUDED.value,
             updated_at = EXCLUDED.updated_at`,
          [stg.key, stg.value, stg.updated_at || new Date().toISOString()]
        );
        pushedTotal++;
      }

      // Adjust PostgreSQL sequences so auto-increments continue smoothly
      const tablesToSequence = [
        'users',
        'customers',
        'vehicles',
        'invoices',
        'invoice_items',
        'expenses',
        'expense_categories',
        'predefined_services',
        'audit_logs',
      ];
      for (const tbl of tablesToSequence) {
        await client.query(`
          SELECT setval(pg_get_serial_sequence('${tbl}', 'id'), COALESCE((SELECT MAX(id) FROM ${tbl}), 1), true)
          WHERE pg_get_serial_sequence('${tbl}', 'id') IS NOT NULL;
        `);
      }

      await client.query('COMMIT');

      // 4. PULL remote PostgreSQL updates -> Local SQLite (Bidirectional)
      // Check if remote Postgres has any records that don't exist locally or are newer
      const remoteCustomers = (await client.query('SELECT * FROM customers')).rows;
      const insertCustomerSql = db.prepare(`
        INSERT INTO customers (id, name, phone, address, vehicle_number, vehicle_model, created_at, updated_at)
        VALUES (@id, @name, @phone, @address, @vehicle_number, @vehicle_model, @created_at, @updated_at)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          phone = excluded.phone,
          address = excluded.address,
          vehicle_number = excluded.vehicle_number,
          vehicle_model = excluded.vehicle_model,
          updated_at = excluded.updated_at
      `);

      for (const rc of remoteCustomers) {
        const local = db.prepare('SELECT id, updated_at FROM customers WHERE id = ?').get(rc.id) as { id: number; updated_at?: string } | undefined;
        if (!local || (rc.updated_at && (!local.updated_at || new Date(rc.updated_at) > new Date(local.updated_at)))) {
          insertCustomerSql.run({
            id: Number(rc.id),
            name: rc.name,
            phone: rc.phone,
            address: rc.address,
            vehicle_number: rc.vehicle_number,
            vehicle_model: rc.vehicle_model,
            created_at: rc.created_at instanceof Date ? rc.created_at.toISOString() : rc.created_at,
            updated_at: rc.updated_at instanceof Date ? rc.updated_at.toISOString() : rc.updated_at,
          });
          pulledTotal++;
        }
      }

      // Pull Invoices
      const remoteInvoices = (await client.query('SELECT * FROM invoices')).rows;
      const insertInvoiceSql = db.prepare(`
        INSERT INTO invoices (id, customer_id, vehicle_id, notes, total_amount, paid_amount, payment_status, payment_method, payment_method_note, service_date, created_at, updated_at)
        VALUES (@id, @customer_id, @vehicle_id, @notes, @total_amount, @paid_amount, @payment_status, @payment_method, @payment_method_note, @service_date, @created_at, @updated_at)
        ON CONFLICT(id) DO UPDATE SET
          customer_id = excluded.customer_id,
          vehicle_id = excluded.vehicle_id,
          notes = excluded.notes,
          total_amount = excluded.total_amount,
          paid_amount = excluded.paid_amount,
          payment_status = excluded.payment_status,
          payment_method = excluded.payment_method,
          payment_method_note = excluded.payment_method_note,
          service_date = excluded.service_date,
          updated_at = excluded.updated_at
      `);

      for (const ri of remoteInvoices) {
        const local = db.prepare('SELECT id, updated_at FROM invoices WHERE id = ?').get(ri.id) as { id: number; updated_at?: string } | undefined;
        if (!local || (ri.updated_at && (!local.updated_at || new Date(ri.updated_at) > new Date(local.updated_at)))) {
          insertInvoiceSql.run({
            id: Number(ri.id),
            customer_id: Number(ri.customer_id),
            vehicle_id: ri.vehicle_id ? Number(ri.vehicle_id) : null,
            notes: ri.notes,
            total_amount: Number(ri.total_amount),
            paid_amount: Number(ri.paid_amount),
            payment_status: ri.payment_status,
            payment_method: ri.payment_method,
            payment_method_note: ri.payment_method_note,
            service_date: ri.service_date,
            created_at: ri.created_at instanceof Date ? ri.created_at.toISOString() : ri.created_at,
            updated_at: ri.updated_at instanceof Date ? ri.updated_at.toISOString() : ri.updated_at,
          });
          pulledTotal++;
        }
      }

      // Update SQLite sequences
      try {
        const localMaxCustomer = (db.prepare('SELECT MAX(id) as max_id FROM customers').get() as { max_id: number | null }).max_id;
        if (localMaxCustomer) {
          db.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('customers', ?) ON CONFLICT(name) DO UPDATE SET seq = excluded.seq").run(localMaxCustomer);
        }
        const localMaxInvoice = (db.prepare('SELECT MAX(id) as max_id FROM invoices').get() as { max_id: number | null }).max_id;
        if (localMaxInvoice) {
          db.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('invoices', ?) ON CONFLICT(name) DO UPDATE SET seq = excluded.seq").run(localMaxInvoice);
        }
      } catch (_) {}

      // Update sync tracking
      setSetting('last_synced_at', nowStr);
      setSetting('last_sync_status', 'synced');
      setSetting('last_sync_error', '');

      return {
        success: true,
        timestamp: nowStr,
        pushedCount: pushedTotal,
        pulledCount: pulledTotal,
      };
    } catch (err: unknown) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[SYNC ERROR]:', errMsg);
    setSetting('last_sync_status', 'error');
    setSetting('last_sync_error', errMsg);
    return {
      success: false,
      timestamp: nowStr,
      pushedCount: pushedTotal,
      pulledCount: pulledTotal,
      error: errMsg,
    };
  } finally {
    isSyncing = false;
  }
}
