const { pool } = require('./db');

// Fire-and-forget: event logging must never fail or slow down a user request.
// No-op when the database isn't configured.
function logEvent(type, realmId, detail) {
  if (!pool) return;
  pool
    .query('INSERT INTO events (type, realm_id, detail) VALUES ($1, $2, $3)', [
      type,
      realmId || null,
      detail || null,
    ])
    .catch(err => console.error(`Event log failed (${type}):`, err.message));
}

// Upsert the company's identity on connect. Fire-and-forget like logEvent.
function recordCompany(realmId, info) {
  if (!pool || !realmId) return;
  pool
    .query(
      `INSERT INTO companies (realm_id, company_name, email, city, state)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (realm_id) DO UPDATE SET
         company_name = COALESCE(EXCLUDED.company_name, companies.company_name),
         email        = COALESCE(EXCLUDED.email, companies.email),
         city         = COALESCE(EXCLUDED.city, companies.city),
         state        = COALESCE(EXCLUDED.state, companies.state),
         last_seen    = now()`,
      [
        realmId,
        info?.CompanyName || null,
        info?.Email?.Address || null,
        info?.CompanyAddr?.City || null,
        info?.CompanyAddr?.CountrySubDivisionCode || null,
      ]
    )
    .catch(err => console.error('Company record failed:', err.message));
}

function touchCompany(realmId) {
  if (!pool || !realmId) return;
  pool
    .query('UPDATE companies SET last_seen = now() WHERE realm_id = $1', [realmId])
    .catch(err => console.error('Company touch failed:', err.message));
}

module.exports = { logEvent, recordCompany, touchCompany };
