# Classic Insurance — connected test website and backend

This folder updates the EXISTING classic-agent-backend Render service. It combines the uploaded website with the authenticated backend already prepared in this conversation. Keep your current PostgreSQL database and existing Render environment variables.

## Deploy this update

1. Download the ZIP and use Windows Extract All. Open the extracted folder and verify filenames contain no extra [1] suffixes.
2. In your existing GitHub classic-agent-backend repository, use Add file > Upload files. Upload the files INSIDE this folder directly at repository root. Allow matching files to be replaced. Do not upload the ZIP itself or put the contents inside an extra folder.
3. Commit changes. This deploys to your existing Render service; no new Blueprint is needed. If auto-deploy is disabled, choose Manual Deploy > Deploy latest commit on the existing web service.
4. Keep DATABASE_URL, DB_SSL and API_KEY unchanged. The migration adds public_submissions without deleting existing leads.
5. After Render shows Live, open https://classic-agent-backend.onrender.com/health and confirm {"status":"ok"}.
6. Open https://classic-agent-backend.onrender.com/ for the website. Hard refresh if the browser shows old content.

## Staff sign-in

In Render, open classic-agent-backend > Environment and add:

STAFF_USERNAME=staff
STAFF_PASSWORD=<a unique random password with at least 16 characters>

Save the changes and allow Render to redeploy. Enter secrets directly in Render; do not put them in GitHub, screenshots or chat. Use a password manager to generate/store the password.

Open https://classic-agent-backend.onrender.com/staff and enter this username/password in the browser sign-in prompt. This password is separate from the backend API_KEY. The staff view is read-only and shows the most recent 200 records. It uses browser HTTP Basic authentication over HTTPS for this test setup; it does not provide individual staff accounts, session logout, or an audit log. Close all browser windows after using a shared computer. Before regular agency use, add individual staff sign-in and session management.

## Verify a fake inquiry

1. On the website, go to the dealership inquiry form.
2. Use Fictional Test Dealer, Test Person, 202-555-0100, and test@example.com.
3. Send the inquiry. A success message appears only after the server confirms a database save.
4. Open /staff, sign in, and verify the inquiry appears.
5. Restart the web service and refresh /staff to check persistence.
6. Opening /api/leads without the original API key should still return 401 Unauthorized.

Public inquiries can create a NEW record but cannot list leads, update stages, mark payments, or read another person's details. Retries use a random submission ID to avoid duplicate database records. Only the created record ID is returned. Retry state survives in the current page, not a full page reload.

## Enable AI chat separately

Chat now calls the server at /public/chat. The server supplies its own prompts, model and token limit; no provider key goes into browser code.

In Render Environment add ANTHROPIC_API_KEY only if you have an Anthropic API account and intend to use its billed API. This is not the Render API_KEY. Optionally set ANTHROPIC_MODEL; the default preserves the uploaded app's claude-sonnet-4-6 model. Confirm that model is available to your API account. Leave the provider key unset to keep chat disabled while testing form submissions.

The integration sends the Messages API headers x-api-key and anthropic-version (2023-06-01). Provider access, billing and live AI responses have NOT been tested here. API reference: https://platform.claude.com/docs/en/api/messages

The test server caps public routes at 300 requests/hour and chat at 100 requests/day across all visitors. Counters are in memory and reset on restart; these are not a durable billing cap. Configure provider spend limits and stronger shared abuse controls before public launch. Long chats must restart after 40 messages.

## What changed

- Website is served from the existing backend origin, avoiding cross-origin integration.
- /public/leads accepts a limited set of contact fields, creates records at stage new, and deduplicates retries transactionally.
- Existing /api routes still require the original bearer API_KEY.
- /staff and /staff/leads require a separate staff password and disable caching.
- Provider requests run on the server, with validated history, fixed prompts, limits and a timeout.
- Failed saves no longer fall back to a misleading browser-only record.
- Simulated payment completion no longer writes paid to real records. Checklists do not claim documents were uploaded.
- Untrusted lead values are displayed as text.

## Remaining scope

This remains a test site. The current free Render PostgreSQL database expires after 30 days and does not provide backups. Use fictional details until durable hosting, backups, staff accounts and operating requirements are in place. See https://render.com/docs/free.

QQCatalyst is still a stub. This update does not enable payments, insurance binding, document uploads or MVA submissions. The supplied site design and business copy are largely preserved and have not been independently verified. Existing records are not retroactively changed.

## Verification performed

npm test: nine route tests cover authorization, input validation, health, outage responses, duplicate submissions, stage restrictions, staff access and disabled chat. Database calls are stubbed; these tests do not establish live PostgreSQL behavior.

Inline website JavaScript passed a syntax check. A browser smoke test could not run because the browser executable was unavailable and its download timed out. Hosted form interaction and visual verification remain to be checked after upload.

## Files and startup

Keep package.json, package-lock.json, server.js, website-routes.js, prompts.js, index.html, staff.html, db.js, migrate.js, schema.sql and qqcatalyst.js at the repository root.

npm ci
npm test
npm run migrate
npm start

render.yaml keeps the existing service/database names and Free plans. Do not create another Blueprint.
