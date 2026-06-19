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
// shapes to figure out how to compute unapplied amounts.
router.get('/api/debug-unapplied', requireAuth, async (req, res) => {
  try {
    const token = await getValidToken(req.session);
    const fetchSample = async (entity) => {
      const query = encodeURIComponent(`SELECT * FROM ${entity} ORDERBY TxnDate DESC MAXRESULTS 5`);
      const data = await qboGet(
        `/v3/company/${req.session.realmId}/query?query=${query}&minorversion=65`,
        token
      );
      return data.QueryResponse?.[entity] || [];
    };

    const [payments, vendorCredits, billPayments] = await Promise.all([
      fetchSample('Payment'),
      fetchSample('VendorCredit'),
      fetchSample('BillPayment'),
    ]);

    res.json({ payments, vendorCredits, billPayments });
  } catch (err) {
    console.error('Debug unapplied error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
