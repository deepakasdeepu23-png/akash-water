import mysql from 'mysql2/promise';
import 'dotenv/config';

export const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'akash_water',
};

export const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true, // DECIMAL columns come back as numbers
  dateStrings: true,    // DATE/TIMESTAMP come back as plain strings
});

// Make CURDATE() match the shop's local day
pool.pool.on('connection', (conn) => {
  conn.query('SET time_zone = ?', [process.env.DB_TIMEZONE || '+05:30']);
});

// Run fn inside a transaction; rolls back automatically on error
export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
