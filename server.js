require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { pool, initDb } = require('./lib/db');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// index: false so `/` falls through to the session-aware route in auth.js
// (connected users get the dashboard, not the Connect page — requirement 1.1)
app.use(express.static('public', { index: false }));

// Render terminates TLS at its proxy, so trust the X-Forwarded-Proto header
// for the secure-cookie check to work in production
const isProduction = process.env.ENVIRONMENT === 'production';
if (isProduction) app.set('trust proxy', 1);

app.use(session({
  // Postgres-backed sessions when a database is configured (survives deploys
  // and restarts); falls back to in-memory for local dev without one
  store: pool ? new pgSession({ pool }) : undefined,
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
}));

app.use('/', authRoutes);
app.use('/', apiRoutes);
app.use('/', adminRoutes);

initDb()
  .catch(err => console.error('Database init failed:', err.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Substrix running at http://localhost:${PORT}`);
    });
  });
