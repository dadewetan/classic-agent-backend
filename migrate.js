require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const pool = require('./db');
(async () => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(753190021)');
    await client.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
    await client.query('COMMIT');
    console.log('Database schema ready');
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Database setup failed:', err.code || err.name);
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await pool.end();
  }
})();
