const express = require('express');
const { buildReconciliationHealth } = require('../lib/reconciliation');
const { fetchGeneralLedgerByCleared, getValidToken, qboGet } = require('../lib/qbo');
const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.token) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

router.get('/api/reconciliation', requireAuth, async (req, res) => {
  try {
    const data = await buildReconciliationHealth(req.session);
    res.json({ accounts: data, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Reconciliation fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Temporary debug endpoint to test cleared-filter behavior on Undeposited Funds.
router.get('/api/debug-undeposited-funds', requireAuth, async (req, res) => {
  try {
    const token = await getValidToken(req.session);
    const query = encodeURIComponent(
      "SELECT * FROM Account WHERE Name = 'Undeposited Funds' MAXRESULTS 10"
    );
    const accountData = await qboGet(
      `/v3/company/${req.session.realmId}/query?query=${query}&minorversion=65`,
      token
    );
    const account = accountData.QueryResponse?.Account?.[0];
    if (!account) return res.status(404).json({ error: 'Undeposited Funds account not found' });

    const [reconciled, cleared, uncleared] = await Promise.all([
      fetchGeneralLedgerByCleared(req.session, account.Id, 'Reconciled'),
      fetchGeneralLedgerByCleared(req.session, account.Id, 'Cleared'),
      fetchGeneralLedgerByCleared(req.session, account.Id, 'Uncleared'),
    ]);

    res.json({ account, reconciled, cleared, uncleared });
  } catch (err) {
    console.error('Debug undeposited funds error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
