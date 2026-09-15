require('dotenv').config();
const { Pool } = require('pg');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
// Defaults to certificate verification. Disable TLS only for local development
// or a host's documented private network connection (Render internal URL).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: true },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 5,
});
pool.on('error', err => console.error('Database pool error:', err.code || err.name));
module.exports = pool;
