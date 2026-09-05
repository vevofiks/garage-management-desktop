const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(__dirname, '../data/garage.db');
console.log('Testing node:sqlite on:', dbPath);

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const users = db.prepare('SELECT id, username, role FROM users').all();
console.log('Users found:', users);

const customers = db.prepare('SELECT count(*) as count FROM customers').get();
console.log('Customers count:', customers);

console.log('SUCCESS: node:sqlite works perfectly!');
