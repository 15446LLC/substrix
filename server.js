require('dotenv').config();
const express = require('express');
const session = require('express-session');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// Render terminates TLS at its proxy, so trust the X-Forwarded-Proto header
// for the secure-cookie check to work in production
const isProduction = process.env.ENVIRONMENT === 'production';
if (isProduction) app.set('trust proxy', 1);

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: isProduction, httpOnly: true, sameSite: 'lax' },
}));

app.use('/', authRoutes);
app.use('/', apiRoutes);

app.listen(PORT, () => {
  console.log(`Substrix running at http://localhost:${PORT}`);
});
