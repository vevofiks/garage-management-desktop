const crypto = require('crypto');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'garage.db');
const db = new Database(dbPath);

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

const args = process.argv.slice(2);
const username = args[0] || 'admin';
const password = args[1] || 'admin';

const hashed = hashPassword(password);

try {
  db.prepare(`
    INSERT INTO users (username, password, role)
    VALUES (?, ?, 'admin')
  `).run(username, hashed);
  console.log(`Admin user created. Username: ${username}`);
} catch (error) {
  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    console.error(`Error: User '${username}' already exists.`);
  } else {
    console.error('Error creating admin:', error.message);
  }
}
