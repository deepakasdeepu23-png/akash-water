// Creates the database + tables and fills in starter content.
// Safe to run more than once: it never overwrites what the owner has edited.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { DEFAULT_SETTINGS } from './settings.js';
import { dbConfig } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(here, '../../database/schema.sql');

const conn = await mysql.createConnection({
  host: dbConfig.host, port: dbConfig.port, user: dbConfig.user, password: dbConfig.password,
  multipleStatements: true,
});

try {
  const schema = fs.readFileSync(schemaPath, 'utf8').replaceAll('akash_water', dbConfig.database);
  await conn.query(schema);
  await conn.query(`USE \`${dbConfig.database}\``);

  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await conn.query('INSERT IGNORE INTO settings (key_name, value) VALUES (?, ?)', [k, v]);
  }

  const [[{ products }]] = await conn.query('SELECT COUNT(*) AS products FROM products');
  if (!products) {
    await conn.query(
      'INSERT INTO products (name, cans, price, section, sort_order) VALUES (?,?,?,?,?), (?,?,?,?,?)',
      ['1 CAN', 1, 40, 'Order', 1, '10 CAN', 10, 400, 'For bulk', 2]);
  }

  const [[{ partners }]] = await conn.query('SELECT COUNT(*) AS partners FROM partners');
  if (!partners) {
    await conn.query(
      'INSERT INTO partners (name, billing_note, sort_order) VALUES (?,?,?), (?,?,?), (?,?,?)',
      ['Exam Center', 'Billed every 4-5 months', 1, 'Garage', 'Billed monthly', 2, 'Worknox', 'Corporate B2B', 3]);
  }

  const [[{ admins }]] = await conn.query('SELECT COUNT(*) AS admins FROM admins');
  if (!admins) {
    const passcode = process.env.ADMIN_PASSCODE;
    if (!passcode || passcode.length < 6) {
      throw new Error('Set ADMIN_PASSCODE (6+ characters) in server/.env, then run this again.');
    }
    await conn.query('INSERT INTO admins (password_hash) VALUES (?)', [await bcrypt.hash(passcode, 10)]);
  }

  console.log(`Database "${dbConfig.database}" is ready.`);
} finally {
  await conn.end();
}
