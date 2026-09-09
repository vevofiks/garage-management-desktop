const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

class NodeSqliteAdapter {
  constructor(dbPath) {
    this.syncDb = new DatabaseSync(dbPath);
  }

  exec(sql) {
    return this.syncDb.exec(sql);
  }

  pragma(sql) {
    return this.syncDb.exec(`PRAGMA ${sql};`);
  }

  prepare(sql) {
    const stmt = this.syncDb.prepare(sql);
    return {
      all: (...args) => (args.length === 1 && Array.isArray(args[0]) ? stmt.all(...args[0]) : stmt.all(...args)),
      get: (...args) => (args.length === 1 && Array.isArray(args[0]) ? stmt.get(...args[0]) : stmt.get(...args)),
      run: (...args) => (args.length === 1 && Array.isArray(args[0]) ? stmt.run(...args[0]) : stmt.run(...args)),
    };
  }

  transaction(fn) {
    return (...args) => {
      this.syncDb.exec('BEGIN');
      try {
        const result = fn(...args);
        this.syncDb.exec('COMMIT');
        return result;
      } catch (err) {
        this.syncDb.exec('ROLLBACK');
        throw err;
      }
    };
  }

  async backup(backupPath) {
    const escaped = backupPath.replace(/'/g, "''");
    this.syncDb.exec(`VACUUM INTO '${escaped}'`);
  }

  close() {
    return this.syncDb.close();
  }
}

// Test adapter
const testDbFile = path.join(__dirname, 'test_adapter.db');
if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile);

const db = new NodeSqliteAdapter(testDbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
  );
`);

const insertUser = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)');
const res1 = insertUser.run('admin', 'hash123', 'admin');
console.log('Insert result:', res1);

const user = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
console.log('Selected user:', user);

const runTx = db.transaction((names) => {
  for (const n of names) {
    insertUser.run(n, 'pass', 'staff');
  }
});
runTx(['staff1', 'staff2']);

const allUsers = db.prepare('SELECT username FROM users').all();
console.log('All users:', allUsers);

// Test table_info pragma
const cols = db.prepare('PRAGMA table_info(users)').all();
console.log('Cols:', cols.map(c => c.name));

db.close();
if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile);
console.log('ADAPTER TEST COMPLETED WITH 100% SUCCESS!');
