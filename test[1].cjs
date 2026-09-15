const { test, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL = 'postgres://unused';
process.env.API_KEY = 'test-only-secret-01234567890123456789';
process.env.ALLOWED_ORIGINS = 'https://staff.example.com';
let queries = [];
let fail = false;
require.cache[require.resolve('./db')] = { exports: { query: async (sql, values) => {
  queries.push({ sql, values });
  if (fail) throw new Error('offline');
  return { rows: [{ id: '12345678-1234-1234-1234-123456789abc', type: 'insurance' }] };
} } };
const app = require('./server');
const server = app.listen(0, '127.0.0.1');
const ready = new Promise(resolve => server.on('listening', resolve));
after(() => new Promise(resolve => server.close(resolve)));
async function request(path, method='GET', body, auth=true) {
  await ready;
  return fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${process.env.API_KEY}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
test('all data endpoints deny requests without credentials before querying database', async () => {
  queries=[];
  const id='12345678-1234-1234-1234-123456789abc';
  for (const [path,method] of [['/api/leads','GET'],['/api/leads','POST'],[`/api/leads/${id}`,'PATCH'],[`/api/leads/${id}/messages`,'POST'],[`/api/leads/${id}/sync-qqcatalyst`,'POST']]) {
    assert.equal((await request(path,method,undefined,false)).status,401);
  }
  assert.equal(queries.length,0);
});
test('valid lead uses parameterized insert', async () => {
  queries=[];
  const fields={name:"Fake O'Example"};
  assert.equal((await request('/api/leads','POST',{type:'insurance',fields})).status,201);
  assert.deepEqual(queries[0].values,['insurance',fields]);
  assert.match(queries[0].sql,/\$1, \$2/);
});
test('invalid fields and identifiers are rejected before database access', async () => {
  queries=[];
  for (const body of [{type:'bad',fields:{}},{type:'insurance',fields:[]},{type:'insurance',fields:'bad'}]) {
    assert.equal((await request('/api/leads','POST',body)).status,400);
  }
  assert.equal((await request('/api/leads/nope','PATCH',{stage:'paid'})).status,400);
  assert.equal(queries.length,0);
});
test('health checks database and returns 503 for outages', async () => {
  assert.equal((await request('/health','GET',undefined,false)).status,200);
  fail=true;
  try { assert.equal((await request('/health','GET',undefined,false)).status,503); }
  finally { fail=false; }
});
