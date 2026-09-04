/**
 * src/lib/db.ts
 *
 * SQLite database connection + schema bootstrap.
 * This module is SERVER-ONLY — import it only inside:
 *   - Next.js API Route Handlers (src/app/api/.../route.ts)
 *   - Next.js Server Components / Server Actions
 *
 * Never import this in client components; better-sqlite3 is Node.js-only.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { hashPassword } from './auth';

// Resolve the `data/` directory relative to user data directory or project root in dev.
export function getDataDir(): string {
  const baseDir =
    process.env.APP_DATA_DIR ||
    (process.env.APPDATA ? path.join(process.env.APPDATA, 'garage-management-system') : null) ||
    (process.platform === 'darwin' && process.env.HOME ? path.join(process.env.HOME, 'Library/Application Support/garage-management-system') : null) ||
    process.cwd();
  return path.join(baseDir, 'data');
}

export const dataDir = getDataDir();

let rawDb: InstanceType<typeof Database> | null = null;
let bootstrapped = false;

function bootstrapDatabase(db: InstanceType<typeof Database>) {
  if (bootstrapped) return;
  bootstrapped = true;

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    -- Users & roles (PRD §3.6)
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      username    TEXT NOT NULL UNIQUE,
      password    TEXT NOT NULL,
      role        TEXT NOT NULL CHECK(role IN ('admin', 'staff')),
      created_at  TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token       TEXT PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at  TEXT NOT NULL,
      created_at  TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Customers (PRD §3.1)
    CREATE TABLE IF NOT EXISTS customers (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      phone           TEXT,
      address         TEXT,
      vehicle_number  TEXT,
      vehicle_model   TEXT,
      created_at      TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Vehicles (PRD §3.1)
    CREATE TABLE IF NOT EXISTS vehicles (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id     INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      vehicle_number  TEXT,
      vehicle_model   TEXT,
      created_at      TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Invoices (PRD §3.3)
    CREATE TABLE IF NOT EXISTS invoices (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id     INTEGER NOT NULL REFERENCES customers(id),
      vehicle_id      INTEGER REFERENCES vehicles(id),
      notes           TEXT,
      total_amount    REAL NOT NULL DEFAULT 0,
      paid_amount     REAL NOT NULL DEFAULT 0,
      payment_status  TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid', 'partial', 'paid')),
      payment_method  TEXT NOT NULL DEFAULT 'cash' CHECK(payment_method IN ('cash', 'card', 'both', 'other')),
      payment_method_note TEXT,
      created_at      TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Invoice line items
    CREATE TABLE IF NOT EXISTS invoice_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id  INTEGER NOT NULL REFERENCES invoices(id),
      description TEXT NOT NULL,
      type        TEXT NOT NULL CHECK(type IN ('part', 'labor', 'discount')),
      amount      REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS predefined_services (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      created_at  TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expense_categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      created_at  TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id  INTEGER NOT NULL REFERENCES expense_categories(id),
      amount       REAL NOT NULL,
      notes        TEXT,
      date         TEXT NOT NULL DEFAULT CURRENT_DATE,
      created_at   TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER,
      username    TEXT NOT NULL,
      action      TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at  TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_customers_vehicle_number ON customers(vehicle_number);
    CREATE INDEX IF NOT EXISTS idx_vehicles_customer_id ON vehicles(customer_id);
    CREATE INDEX IF NOT EXISTS idx_vehicles_vehicle_number ON vehicles(vehicle_number);
    CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
  `);

  // Migrations
  const currentCustomerColumns = db.prepare('PRAGMA table_info(customers)').all() as { name: string }[];
  if (!currentCustomerColumns.some((c) => c.name === 'address')) {
    db.exec('ALTER TABLE customers ADD COLUMN address TEXT');
  }
  if (!currentCustomerColumns.some((c) => c.name === 'vehicle_number')) {
    db.exec('ALTER TABLE customers ADD COLUMN vehicle_number TEXT');
  }
  if (!currentCustomerColumns.some((c) => c.name === 'vehicle_model')) {
    db.exec('ALTER TABLE customers ADD COLUMN vehicle_model TEXT');
  }

  const currentExpenseColumns = db.prepare('PRAGMA table_info(expenses)').all() as { name: string }[];
  if (!currentExpenseColumns.some((c) => c.name === 'category_id')) {
    db.exec('ALTER TABLE expenses ADD COLUMN category_id INTEGER REFERENCES expense_categories(id)');
    const defaultCat = db.prepare('SELECT id FROM expense_categories WHERE name = ?').get('Parts Purchase') as { id: number } | undefined;
    if (defaultCat) {
      db.prepare('UPDATE expenses SET category_id = ? WHERE category_id IS NULL').run(defaultCat.id);
    }
  }

  const currentInvoiceColumns = db.prepare('PRAGMA table_info(invoices)').all() as { name: string }[];
  if (!currentInvoiceColumns.some((c) => c.name === 'payment_method')) {
    db.exec("ALTER TABLE invoices ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash' CHECK(payment_method IN ('cash', 'card', 'both', 'other'))");
  }
  if (!currentInvoiceColumns.some((c) => c.name === 'payment_method_note')) {
    db.exec('ALTER TABLE invoices ADD COLUMN payment_method_note TEXT');
  }

  const invoicesTableSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'invoices'").get() as { sql: string } | undefined)?.sql ?? '';
  if (invoicesTableSql && !invoicesTableSql.includes("'both'")) {
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`
        CREATE TABLE invoices_new (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id         INTEGER NOT NULL REFERENCES customers(id),
          vehicle_id          INTEGER REFERENCES vehicles(id),
          notes               TEXT,
          total_amount        REAL NOT NULL DEFAULT 0,
          paid_amount         REAL NOT NULL DEFAULT 0,
          payment_status      TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid', 'partial', 'paid')),
          payment_method      TEXT NOT NULL DEFAULT 'cash' CHECK(payment_method IN ('cash', 'card', 'both', 'other')),
          payment_method_note TEXT,
          created_at          TEXT DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO invoices_new (id, customer_id, vehicle_id, notes, total_amount, paid_amount, payment_status, payment_method, payment_method_note, created_at)
        SELECT id, customer_id, vehicle_id, notes, total_amount, paid_amount, payment_status, payment_method, payment_method_note, created_at FROM invoices;
        DROP INDEX IF EXISTS idx_invoices_customer_id;
        DROP INDEX IF EXISTS idx_invoices_vehicle_id;
        DROP TABLE invoices;
        ALTER TABLE invoices_new RENAME TO invoices;
        CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
        CREATE INDEX IF NOT EXISTS idx_invoices_vehicle_id ON invoices(vehicle_id);
      `);
    })();
    db.pragma('foreign_keys = ON');
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id)');

  const invoiceItemsTableSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'invoice_items'").get() as { sql: string } | undefined)?.sql ?? '';
  if (invoiceItemsTableSql.includes("'tax'")) {
    db.exec("UPDATE invoice_items SET type = 'labor' WHERE type = 'tax'");
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`
        CREATE TABLE invoice_items_new (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_id  INTEGER NOT NULL REFERENCES invoices(id),
          description TEXT NOT NULL,
          type        TEXT NOT NULL CHECK(type IN ('part', 'labor', 'discount')),
          amount      REAL NOT NULL DEFAULT 0
        );
        INSERT INTO invoice_items_new (id, invoice_id, description, type, amount)
        SELECT id, invoice_id, description, type, amount FROM invoice_items;
        DROP INDEX IF EXISTS idx_invoice_items_invoice_id;
        DROP TABLE invoice_items;
        ALTER TABLE invoice_items_new RENAME TO invoice_items;
        CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
      `);
    })();
    db.pragma('foreign_keys = ON');
  }

  // Ensure updated_at column exists and add triggers for cloud sync tracking
  const tablesWithUpdatedAt = [
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
  for (const table of tablesWithUpdatedAt) {
    try {
      const cols = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
      if (!cols.some((c) => c.name === 'updated_at')) {
        db.exec(`ALTER TABLE "${table}" ADD COLUMN updated_at TEXT`);
        db.exec(`UPDATE "${table}" SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL`);
      }
      if (table === 'settings') {
        db.exec(`
          CREATE TRIGGER IF NOT EXISTS trg_${table}_updated_at AFTER UPDATE ON ${table}
          BEGIN
            UPDATE ${table} SET updated_at = CURRENT_TIMESTAMP WHERE key = NEW.key;
          END;
        `);
      } else {
        db.exec(`
          CREATE TRIGGER IF NOT EXISTS trg_${table}_updated_at AFTER UPDATE ON ${table}
          BEGIN
            UPDATE ${table} SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
          END;
        `);
      }
    } catch (_) {}
  }

  // Seed expense categories
  const EXPENSE_CATEGORIES = ['Parts Purchase', 'Rent', 'Utilities', 'Salaries'];
  const insertExpenseCategory = db.prepare('INSERT OR IGNORE INTO expense_categories (name) VALUES (?)');
  db.transaction((names: string[]) => {
    for (const name of names) insertExpenseCategory.run(name);
  })(EXPENSE_CATEGORIES);

  // Seed predefined services
  const PREDEFINED_SERVICES = [
    'Engine oil & Oil filter change',
    'Air filter change',
    'AC cabin filter change',
    'Front brake pad change',
    'Rear brake shoe change',
    'Gear oil change',
    'Differential oil change',
    'Wiper blade change',
    'Radiator removing and fitting',
    'AC hose removing and fitting',
    'AC hose crimping',
    'AC compressor change',
    'Condenser change',
    'Expansion valve change',
  ];
  const insertPredefinedService = db.prepare('INSERT OR IGNORE INTO predefined_services (name) VALUES (?)');
  db.transaction((names: string[]) => {
    for (const name of names) insertPredefinedService.run(name);
  })(PREDEFINED_SERVICES);

  // Seed default admin user
  const userCount = (db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count;
  if (userCount === 0) {
    const defaultPasswordHash = hashPassword('admin123');
    db.prepare('INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', defaultPasswordHash, 'admin');
  }
}

function getRawDb(): InstanceType<typeof Database> {
  if (!rawDb) {
    const dir = getDataDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const customPath = process.env.DATABASE_PATH || (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('postgres') ? process.env.DATABASE_URL : undefined);
    const dbPath = customPath || path.join(dir, 'garage.db');
    console.log('[DB] Initializing SQLite database at:', dbPath);
    rawDb = new Database(dbPath);
    bootstrapDatabase(rawDb);
  }
  return rawDb;
}

const db = new Proxy({} as InstanceType<typeof Database>, {
  get(_target, prop, receiver) {
    const instance = getRawDb();
    const val = Reflect.get(instance, prop, receiver);
    return typeof val === 'function' ? val.bind(instance) : val;
  },
});

export function getSetting(key: string, defaultValue: string = ''): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : defaultValue;
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export async function checkAndPerformWeeklyBackup(): Promise<boolean> {
  const enabled = getSetting('weekly_backup_enabled', '1') === '1';
  if (!enabled) return false;

  const lastBackupStr = getSetting('last_weekly_backup_at', '');
  const now = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  if (lastBackupStr && now - new Date(lastBackupStr).getTime() < SEVEN_DAYS_MS) {
    return false;
  }

  const backupsDir = path.join(dataDir, 'backups');
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

  const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `garage-backup-${dateStr}.sqlite`;
  const backupPath = path.join(backupsDir, backupFileName);

  try {
    await db.backup(backupPath);
    setSetting('last_weekly_backup_at', new Date().toISOString());
    return true;
  } catch (err) {
    console.error('Weekly automatic backup failed:', err);
    return false;
  }
}

export default db;
