// QQCatalyst API sync — placeholder until Classic is registered as a
// QQ Solutions API partner and has sandbox/live OAuth2 credentials
// (see Section 5.2 of the architecture plan for the registration step).

async function getAccessToken() {
  // TODO: implement the OAuth2 client-credentials exchange QQCatalyst requires.
  // const res = await fetch(`${process.env.QQCATALYST_API_BASE}/oauth/token`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  //   body: new URLSearchParams({
  //     grant_type: 'client_credentials',
  //     client_id: process.env.QQCATALYST_CLIENT_ID,
  //     client_secret: process.env.QQCATALYST_CLIENT_SECRET,
  //   }),
  // });
  // const data = await res.json();
  // return data.access_token;
  throw new Error('QQCatalyst OAuth2 exchange not yet implemented');
}

async function syncLeadToQQCatalyst(lead) {
  if (!process.env.QQCATALYST_CLIENT_ID) {
    console.warn('[qqcatalyst] credentials not configured — skipping sync for lead', lead.id);
    return { synced: false, reason: 'not_configured' };
  }
  try {
    const token = await getAccessToken();
    // TODO: POST the lead into QQCatalyst as a contact/task, mapping `lead.fields`
    // to whatever field names QQCatalyst's API expects. The exact shape depends
    // on the partner API docs QQ Solutions provides after registration.
    // const res = await fetch(`${process.env.QQCATALYST_API_BASE}/contacts`, {
    //   method: 'POST',
    //   headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ /* mapped fields */ }),
    // });
    // const created = await res.json();
    // return { synced: true, recordId: created.id };
    return { synced: false, reason: 'not_implemented' };
  } catch (err) {
    console.error('[qqcatalyst] sync failed', err);
    return { synced: false, reason: 'error', error: err.message };
  }
}

module.exports = { syncLeadToQQCatalyst };
