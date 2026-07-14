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

module.exports = { logEvent };
