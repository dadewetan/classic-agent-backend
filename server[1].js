require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const { syncLeadToQQCatalyst } = require('./qqcatalyst');

const { timingSafeEqual, createHash } = require('node:crypto');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!process.env.API_KEY || process.env.API_KEY.length < 32) {
  throw new Error('API_KEY must contain at least 32 characters');
}
const app = express();
app.disable('x-powered-by');
const origins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: (origin, cb) => cb(null, Boolean(origin && origins.includes(origin))) }));
require('./website-routes')(app, pool);
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT id FROM leads LIMIT 0');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});
// Server-to-server access only. Never embed this key in a browser bundle.
const digest = value => createHash('sha256').update(value).digest();
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const supplied = req.get('Authorization') || '';
  if (!timingSafeEqual(digest(supplied), digest(`Bearer ${process.env.API_KEY}`))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
app.use(express.json({ limit: '2mb' }));

const objectFields = value => value && typeof value === 'object' && !Array.isArray(value);
const types = ['insurance', 'tags_title', 'dealership'];
const stages = ['new', 'onboarding_complete', 'paid'];
app.param('id', (req, res, next, id) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: 'Invalid lead ID' });
  }
  next();
});

// Create a new lead — called by the chat widget when it captures a
// lead-summary, or by the dealership inquiry form.
app.post('/api/leads', async (req, res) => {
  const { type, fields } = req.body || {};
  if (!types.includes(type) || !objectFields(fields)) return res.status(400).json({ error: 'type and fields are required' });
  try {
    const result = await pool.query(
      `insert into leads (type, fields) values ($1, $2) returning *`,
      [type, fields]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[POST /api/leads]', err.code || err.name);
    res.status(500).json({ error: 'Could not save lead' });
  }
});

// Update a lead's stage (onboarding_complete, paid) and/or merge new fields.
app.patch('/api/leads/:id', async (req, res) => {
  const { stage, fields } = req.body || {};
  if ((stage !== undefined && !stages.includes(stage)) ||
      (fields !== undefined && !objectFields(fields)) ||
      (stage === undefined && fields === undefined)) {
    return res.status(400).json({ error: 'Valid stage or fields required' });
  }
  try {
    const result = await pool.query(
      `update leads
       set stage = coalesce($1, stage),
           fields = case when $2::jsonb is not null then fields || $2::jsonb else fields end,
           updated_at = now()
       where id = $3
       returning *`,
      [stage || null, fields ? JSON.stringify(fields) : null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[PATCH /api/leads/:id]', err.code || err.name);
    res.status(500).json({ error: 'Could not update lead' });
  }
});

// Staff view — list recent leads.
app.get('/api/leads', async (req, res) => {
  try {
    const result = await pool.query(`select * from leads order by created_at desc limit 200`);
    res.json(result.rows);
  } catch (err) {
    console.error('[GET /api/leads]', err.code || err.name);
    res.status(500).json({ error: 'Could not load leads' });
  }
});

// Append a chat message to a lead's transcript (optional, for audit trail).
app.post('/api/leads/:id/messages', async (req, res) => {
  const { role, content } = req.body || {};
  if (!['user', 'assistant'].includes(role) || typeof content !== 'string' ||
      !content.trim() || content.length > 20000) {
    return res.status(400).json({ error: 'Valid role and content required (maximum 20000 characters)' });
  }
  try {
    const result = await pool.query(
      `insert into lead_messages (lead_id, role, content) values ($1, $2, $3) returning *`,
      [req.params.id, role, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[POST /api/leads/:id/messages]', err.code || err.name);
    res.status(500).json({ error: 'Could not save message' });
  }
});

// Push a lead into QQCatalyst once API partner credentials exist.
app.post('/api/leads/:id/sync-qqcatalyst', async (req, res) => {
  try {
    const result = await pool.query(`select * from leads where id = $1`, [req.params.id]);
    const lead = result.rows[0];
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const syncResult = await syncLeadToQQCatalyst(lead);
    if (syncResult.synced) {
      await pool.query(
        `update leads set qqcatalyst_synced = true, qqcatalyst_record_id = $1 where id = $2`,
        [syncResult.recordId, lead.id]
      );
    }
    res.json(syncResult);
  } catch (err) {
    console.error('[POST /api/leads/:id/sync-qqcatalyst]', err.code || err.name);
    res.status(500).json({ error: 'Sync failed' });
  }
});

app.use((err, req, res, next) => {
  const status = err.status === 413 ? 413 : err.status === 400 ? 400 : 500;
  res.status(status).json({ error: status === 413 ? 'Request too large' : status === 400 ? 'Invalid JSON' : 'Request failed' });
});
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, '0.0.0.0', () => console.log(`Backend listening on port ${PORT}`));
  process.on('SIGTERM', () => {
    server.close(() => pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
module.exports = app;
