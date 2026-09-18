const express = require('express');
const path = require('node:path');
const { createHash, timingSafeEqual } = require('node:crypto');
const prompts = require('./prompts');
const hash = value => createHash('sha256').update(value).digest();
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
// Single-instance test limits. These reset at restart; use a shared limiter and
// provider spend caps before a public production launch.
function limit(max, duration) {
  let count=0, reset=0;
  return (req,res,next) => {
    if(Date.now() >= reset){ count=0; reset=Date.now()+duration; }
    if(++count > max) return res.status(429).json({error:'Request limit reached. Please try again later.'});
    next();
  };
}
module.exports = (app, pool) => {
  app.get('/', (req,res) => res.sendFile(path.join(__dirname,'index.html')));
  const publicRouter=express.Router();
  publicRouter.use((req,res,next) => { res.set('Cache-Control','no-store'); next(); });
  publicRouter.use(limit(300, 60*60*1000));
  publicRouter.use(express.json({limit:'64kb'}));
  publicRouter.post('/leads', async (req,res) => {
    const {type,fields,submissionId}=req.body || {};
    const allowed = ['name','phone','email','dealership','volume','message','insurance_type','details','current_coverage','request_type','vehicle','lienholder'];
    if(!['insurance','tags_title','dealership'].includes(type) || !uuid(submissionId) ||
      !fields || typeof fields !== 'object' || Array.isArray(fields) ||
      !Object.keys(fields).length || Object.keys(fields).some(k => !allowed.includes(k)) ||
      Object.values(fields).some(v => typeof v !== 'string' || v.length > 4000) ||
      !fields.name?.trim() || !(fields.phone?.trim() || fields.email?.trim())) {
      return res.status(400).json({error:'Please provide a name and contact details using the inquiry form.'});
    }
    let client;
    try {
      client=await pool.connect();
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',[submissionId]);
      const existing=await client.query('SELECT lead_id FROM public_submissions WHERE submission_id=$1',[submissionId]);
      if(existing.rows.length){
        await client.query('COMMIT');
        return res.json({id:existing.rows[0].lead_id});
      }
      // Stage is controlled exclusively by staff; ignore any client stage value.
      const result=await client.query('INSERT INTO leads(type, fields) VALUES($1,$2) RETURNING id',[type,fields]);
      const id=result.rows[0].id;
      await client.query('INSERT INTO public_submissions(submission_id,lead_id) VALUES($1,$2)',[submissionId,id]);
      await client.query('COMMIT');
      res.status(201).json({id});
    } catch(err) {
      if(client) await client.query('ROLLBACK').catch(()=>{});
      console.error('Public submission failed:',err.code || err.name);
      res.status(503).json({error:'Your inquiry could not be saved. Please retry.'});
    } finally { if(client) client.release(); }
  });
  publicRouter.post('/chat', limit(100,24*60*60*1000), async(req,res) => {
    if(!process.env.ANTHROPIC_API_KEY) return res.status(503).json({error:'The chat assistant is not enabled yet. Please contact the office.'});
    const {section,messages}=req.body || {};
    if(!Object.hasOwn(prompts,section || '') || !Array.isArray(messages) || !messages.length || messages.length > 40 ||
      messages.some(m => !m || !['user','assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim() || m.content.length > 5000)) {
      return res.status(400).json({error:'Please start a new chat and send a shorter message.'});
    }
    try {
      const response=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST', signal:AbortSignal.timeout(45000),
        headers:{'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
        body:JSON.stringify({model:process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',max_tokens:1000,system:prompts[section],messages:messages.map(m=>({role:m.role,content:m.content}))})
      });
      if(!response.ok) { console.error('Chat provider status:',response.status); return res.status(502).json({error:'The assistant is unavailable. Please try again later.'}); }
      const data=await response.json();
      res.json({content:(data.content || []).filter(b=>b.type==='text').map(b=>({type:'text',text:b.text}))});
    } catch { res.status(502).json({error:'The assistant could not respond. Please try again later.'}); }
  });
  app.use('/public',publicRouter);
  const staff=express.Router();
  staff.use(limit(100,15*60*1000));
  staff.use((req,res,next)=>{
    res.set('Cache-Control','no-store');
    if(!process.env.STAFF_PASSWORD || process.env.STAFF_PASSWORD.length < 16) return res.status(503).send('Staff sign-in is not configured. Set STAFF_PASSWORD in Render (at least 16 characters).');
    const expected='Basic '+Buffer.from(`${process.env.STAFF_USERNAME || 'staff'}:${process.env.STAFF_PASSWORD}`).toString('base64');
    if(!timingSafeEqual(hash(req.get('Authorization') || ''),hash(expected))) {
      res.set('WWW-Authenticate','Basic realm="Classic staff", charset="UTF-8"');
      return res.status(401).send('Staff sign-in required.');
    }
    next();
  });
  staff.get('/',(req,res)=>res.sendFile(path.join(__dirname,'staff.html')));
  staff.get('/leads',async(req,res)=>{
    try { const result=await pool.query('SELECT id,type,stage,fields,created_at FROM leads ORDER BY created_at DESC LIMIT 200'); res.json(result.rows); }
    catch { res.status(503).json({error:'Records are unavailable. Please retry.'}); }
  });
  app.use('/staff',staff);
};
