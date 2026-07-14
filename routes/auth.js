const express = require('express');
const path = require('path');
const crypto = require('crypto');
const OAuthClient = require('intuit-oauth');
const createOAuthClient = require('../lib/oauthClient');
const { logEvent, recordCompany, touchCompany } = require('../lib/events');
const { fetchCompanyInfo } = require('../lib/qbo');
const router = express.Router();

// Connected users skip the Connect page and land on the dashboard
router.get('/', (req, res) => {
  if (req.session.token) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

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
    logEvent('connect', req.query.realmId);
    // Fire-and-forget: identify the company for the admin list; never block
    // or fail the connect flow over it
    fetchCompanyInfo(req.session)
      .then(info => recordCompany(req.query.realmId, info))
      .catch(err => {
        console.error('CompanyInfo fetch failed:', err.message);
        recordCompany(req.query.realmId, null);
      });
    res.redirect('/dashboard');
  } catch (err) {
    console.error('OAuth callback error:', err);
    logEvent('connect_error', req.query.realmId, err.message);
    res.status(500).send('Authentication failed. Check the console for details.');
  }
});

router.get('/dashboard', (req, res) => {
  if (!req.session.token) return res.redirect('/');
  logEvent('dashboard_view', req.session.realmId);
  touchCompany(req.session.realmId);
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

router.get('/disconnect', async (req, res) => {
  logEvent('disconnect', req.session.realmId);
  // Marketplace requirement 2.3: disconnecting must revoke the OAuth grant at
  // Intuit, not just clear the local session
  if (req.session.token) {
    try {
      const client = createOAuthClient();
      client.setToken(req.session.token);
      await client.revoke();
    } catch (err) {
      console.error('Token revoke failed (continuing with local disconnect):', err.message);
    }
  }
  req.session.destroy(() => res.redirect('/disconnected'));
});

// Also the target for Intuit-initiated disconnects (the Disconnect URL
// registered in the developer portal) — those arrive with ?realmId= and no
// session, so this must work statelessly. Marketplace requirement 5.3.
router.get('/disconnected', (req, res) => {
  if (req.query.realmId) logEvent('disconnect_via_intuit', req.query.realmId);
  res.sendFile(path.join(__dirname, '../public/disconnected.html'));
});

module.exports = router;
