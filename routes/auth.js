const express = require('express');
const path = require('path');
const OAuthClient = require('intuit-oauth');
const oauthClient = require('../lib/oauthClient');
const router = express.Router();

router.get('/connect', (req, res) => {
  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: 'sentri',
  });
  res.redirect(authUri);
});

router.get('/callback', async (req, res) => {
  try {
    const authResponse = await oauthClient.createToken(req.url);
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
