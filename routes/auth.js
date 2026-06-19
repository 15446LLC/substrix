const express = require('express');
const path = require('path');
const crypto = require('crypto');
const OAuthClient = require('intuit-oauth');
const createOAuthClient = require('../lib/oauthClient');
const router = express.Router();

router.get('/connect', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  const authUri = createOAuthClient().authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state,
  });
  res.redirect(authUri);
});

router.get('/callback', async (req, res) => {
  const expectedState = req.session.oauthState;
  delete req.session.oauthState;

  if (!expectedState || req.query.state !== expectedState) {
    console.error('OAuth callback state mismatch — possible CSRF attempt.');
    return res.status(403).send('Authentication failed: invalid state. Please try connecting again.');
  }

  try {
    const authResponse = await createOAuthClient().createToken(req.url);
    req.session.token = authResponse.getJson();
    req.session.realmId = req.query.realmId;
    res.redirect('/dashboard');
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('Authentication failed. Check the console for details.');
  }
});

router.get('/dashboard', (req, res) => {
  if (!req.session.token) return res.redirect('/');
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

router.get('/disconnect', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

module.exports = router;
