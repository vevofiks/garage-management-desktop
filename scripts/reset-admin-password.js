const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

const args = process.argv.slice(2);
const newPassword = args[0] || 'admin123';
const username = args[1] || 'admin';
const hashedPassword = hashPassword(newPassword);

console.log(`Setting password for user '${username}' to: '${newPassword}'...`);

// 1. Update project data/garage.db
const paths = [
  path.join(process.cwd(), 'data/garage.db'),
  path.join(process.env.APPDATA || '', 'garage-management-system/data/garage.db'),
];

let Database;
try {
  Database = require(path.join(process.cwd(), 'node_modules/better-sqlite3'));
} catch (_) {
  Database = require('better-sqlite3');
}

for (const p of paths) {
  if (fs.existsSync(p)) {
    try {
      const db = new Database(p);
      const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (exists) {
        db.prepare('UPDATE users SET password = ? WHERE username = ?').run(hashedPassword, username);
        console.log(`✓ Updated password in SQLite database: ${p}`);
      } else {
        db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, 'admin')").run(username, hashedPassword);
        console.log(`✓ Created admin user in SQLite database: ${p}`);
      }
    } catch (e) {
      console.error(`Failed to update ${p}:`, e.message);
    }
  }
}

// 2. Also update Neon Cloud DB if configured
const cloudUrl = process.env.DATABASE_URL || process.env.CLOUD_DATABASE_URL || "postgresql://neondb_owner:npg_2WfIXydQTn1z@ep-purple-frost-aynhchr1-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require";

if (cloudUrl && cloudUrl.startsWith('postgres')) {
  let Pool;
  try {
    Pool = require(path.join(process.cwd(), 'node_modules/pg')).Pool;
  } catch (_) {
    try { Pool = require('pg').Pool; } catch (_) {}
  }

  if (Pool) {
    const pool = new Pool({ connectionString: cloudUrl, ssl: { rejectUnauthorized: false } });
    pool.query(`
      INSERT INTO users (username, password, role)
      VALUES ($1, $2, 'admin')
      ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password
    `, [username, hashedPassword])
      .then(() => {
        console.log(`✓ Updated password in Neon Cloud PostgreSQL`);
      })
      .catch((e) => {
        console.warn(`Could not update cloud db:`, e.message);
      })
      .finally(() => pool.end());
  }
}
