const express = require('express');
const { buildReconciliationHealth } = require('../lib/reconciliation');
const { buildUndepositedFundsHealth } = require('../lib/undepositedFunds');
const { getValidToken, qboGet } = require('../lib/qbo');
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

router.get('/api/undeposited-funds', requireAuth, async (req, res) => {
  try {
    const data = await buildUndepositedFundsHealth(req.session);
    res.json({ ...data, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Undeposited funds fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Temporary debug endpoint: inspect real Payment/VendorCredit/BillPayment
// shapes, and test whether UnappliedAmt/Balance are queryable server-side.
router.get('/api/debug-unapplied', requireAuth, async (req, res) => {
  try {
    const token = await getValidToken(req.session);
    const tryQuery = async (label, queryStr) => {
      try {
        const query = encodeURIComponent(queryStr);
        const data = await qboGet(
          `/v3/company/${req.session.realmId}/query?query=${query}&minorversion=65`,
          token
        );
        return { label, ok: true, count: Object.values(data.QueryResponse || {}).flat().length, sample: data.QueryResponse };
      } catch (err) {
        return { label, ok: false, error: err.message };
      }
    };

    const results = await Promise.all([
      tryQuery('Payment WHERE UnappliedAmt > 0', "SELECT * FROM Payment WHERE UnappliedAmt > '0' MAXRESULTS 10"),
      tryQuery('VendorCredit WHERE Balance > 0', "SELECT * FROM VendorCredit WHERE Balance > '0' MAXRESULTS 10"),
      tryQuery('BillPayment sample', 'SELECT * FROM BillPayment ORDERBY TxnDate DESC MAXRESULTS 5'),
    ]);

    res.json({ results });
  } catch (err) {
    console.error('Debug unapplied error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
