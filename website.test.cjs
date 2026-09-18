const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const app=express();
let calls=[], submissions=new Map(), leads=[], broken=false;
const client={release(){},async query(sql,values){
 calls.push({sql,values});
 if(broken)throw new Error('offline');
 if(sql.startsWith('SELECT lead_id'))return {rows:submissions.has(values[0])?[{lead_id:submissions.get(values[0])}]:[]};
 if(sql.startsWith('INSERT INTO leads')){const lead={id:'12345678-1234-1234-1234-123456789abc',type:values[0],fields:values[1],stage:'new'};leads.push(lead);return {rows:[lead]};}
 if(sql.startsWith('INSERT INTO public_submissions'))submissions.set(values[0],values[1]);
 return {rows:leads};
}};
const pool={connect:async()=>client,query:(...args)=>client.query(...args)};
require('./website-routes')(app,pool);
const server=app.listen(0,'127.0.0.1');
const ready=new Promise(r=>server.on('listening',r));
after(()=>new Promise(r=>server.close(r)));
async function request(path,body,auth){await ready;return fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{Authorization:auth}:{})},body:body?JSON.stringify(body):undefined});}
const payload={type:'dealership',fields:{name:'Fake Test',phone:'202-555-0100'},submissionId:'55555555-1234-1234-1234-123456789abc',stage:'paid'};
test('public inquiry is created once; repeat submission returns same ID and cannot set paid',async()=>{
 const first=await request('/public/leads',payload);assert.equal(first.status,201);const saved=await first.json();assert.deepEqual(Object.keys(saved),['id']);
 const retry=await request('/public/leads',payload);assert.equal(retry.status,200);assert.deepEqual(await retry.json(),saved);assert.equal(leads.length,1);assert.equal(leads[0].stage,'new');
});
test('public path cannot list records or supply invalid fields',async()=>{
 assert.equal((await request('/public/leads')).status,404);
 assert.equal((await request('/public/leads',{...payload,fields:{name:'Fake',phone:'555',unknown:'bad'}})).status,400);
});
test('database outage is an explicit save failure',async()=>{
 broken=true;try{assert.equal((await request('/public/leads',{...payload,submissionId:'66666666-1234-1234-1234-123456789abc'})).status,503);}finally{broken=false;}
});
test('staff routes fail closed and require separate credentials',async()=>{
 delete process.env.STAFF_PASSWORD;assert.equal((await request('/staff/leads')).status,503);
 process.env.STAFF_PASSWORD='test-password-long-enough';
 assert.equal((await request('/staff/leads')).status,401);
 const auth='Basic '+Buffer.from('staff:'+process.env.STAFF_PASSWORD).toString('base64');
 const res=await request('/staff/leads',undefined,auth);assert.equal(res.status,200);assert.equal((await res.json()).length,1);
});
test('chat without provider key fails clearly; site does not ship a provider secret',async()=>{
 delete process.env.ANTHROPIC_API_KEY;
 assert.equal((await request('/public/chat',{section:'insurance',messages:[{role:'user',content:'Hello'}]})).status,503);
 const html=await (await request('/')).text();assert.ok(html.includes("fetch('/public/leads'"));assert.ok(!html.includes('api.anthropic.com'));assert.ok(!html.includes('API_KEY'));assert.ok(!html.includes('window.__localFallbackLeads'));
});
