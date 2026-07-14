const { Pool } = require('pg');

// Single shared pool, or null when DATABASE_URL isn't configured (local dev
// without a database). Callers must handle the null case — everything that
// touches the database is optional-by-design so the app runs without one.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
    })
  : null;

async function initDb() {
  if (!pool) {
    console.warn('DATABASE_URL not set — sessions are in-memory and event logging is off.');
    return;
  }
  // Session table schema expected by connect-pg-simple
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid"    varchar      NOT NULL PRIMARY KEY,
      "sess"   json         NOT NULL,
      "expire" timestamp(6) NOT NULL
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id         bigserial PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now(),
      type       text        NOT NULL,
      realm_id   text,
      detail     text
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS feedback (
      id         bigserial PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now(),
      realm_id   text,
      message    text NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS companies (
      realm_id        text PRIMARY KEY,
      company_name    text,
      email           text,
      city            text,
      state           text,
      first_connected timestamptz NOT NULL DEFAULT now(),
      last_seen       timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log('Database ready (sessions + events).');
}

module.exports = { pool, initDb };
