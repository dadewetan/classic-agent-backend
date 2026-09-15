# Classic Agent Backend — deployment setup

Node.js 24, Express and PostgreSQL. This package is prepared for an online TEST deployment; it has not yet been deployed or tested against your hosted database.

## 1. Put the extracted files on GitHub

On Windows, right-click the downloaded ZIP, choose Extract All, then open the extracted folder.
In classic-agent-backend on GitHub, choose Add file > Upload files.
Upload the CONTENTS so package.json, server.js, schema.sql and render.yaml appear directly in the repository's main file list. Do not upload another ZIP as the deployment source.
Include package-lock.json. Commit the files. Never upload .env or node_modules.
The old ZIP is not used by deployment.

## 2. Deploy a test instance

1. Sign in at https://dashboard.render.com/ and connect your GitHub account.
2. Choose New > Blueprint and select classic-agent-backend.
3. Render reads render.yaml and proposes a web service plus PostgreSQL database.
4. Review the plans: this file explicitly selects Free for BOTH resources. Confirm the dashboard's estimate before deploying; do not accept an unexpected paid plan.
5. Deploy. The database connection is supplied automatically and API_KEY is generated as a secret.
6. Wait for the web service to become Live. Open its assigned HTTPS URL followed by /health. Success is {"status":"ok"}.

Free is only for a trial with fake data: the web service sleeps after 15 minutes without traffic; the free database expires after 30 days and has no backups. Before real agency use, choose suitable paid resources, backups and staff access controls. No paid resources have been purchased by preparing this package.

Render references (checked September 15, 2026):
- https://render.com/docs/deploy-node-express-app
- https://render.com/docs/blueprint-spec
- https://render.com/docs/free
- https://render.com/docs/postgresql-creating-connecting

## 3. Test the API privately

Find API_KEY in the web service's Environment settings. Keep it private; do not paste it in screenshots, GitHub or chat.
In an API client such as Postman, send:

POST https://YOUR-SERVICE.onrender.com/api/leads
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{"type":"insurance","fields":{"name":"Test Customer","email":"test@example.com"}}

Expect 201 with the saved lead. Then GET /api/leads with the same authorization header should return it. A request without the key should return 401. Restart the service and repeat GET to verify persistence.

## Website connection remains a separate step

All /api endpoints now require a bearer key. These endpoints are for trusted server-to-server calls. Do NOT put the key in browser JavaScript, a public Claude artifact, or a VITE_ variable. Provide the website source next so a server-side integration or proper staff login can be added. A public form must not be given a key that can list or update all leads. CORS is not authentication.

QQCatalyst sync remains an unimplemented stub. Document uploads are not implemented; schema.sql only defines a table for document references. This package does not include a staff dashboard, individual user accounts, abuse controls for a public submission endpoint, or automated backups.

## Local development

Copy .env.example to .env. Set DATABASE_URL and a random API_KEY of at least 32 characters. Generate one with:

node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"

Use DB_SSL=false for local PostgreSQL or Render's private internal URL (as configured in render.yaml). External database connections default to certificate-verified TLS. Never disable certificate verification to fix an external connection.

npm ci
npm run migrate
npm start

The migration uses the pg driver, runs inside a transaction and uses an advisory lock. It creates missing tables without deleting existing rows. Future schema changes require deliberate migrations; CREATE TABLE IF NOT EXISTS does not modify existing columns.

npm test runs authentication, validation, parameterized-query and health checks using a stubbed database. Hosted connectivity, schema installation and persistence must be verified after deployment using the steps above.
