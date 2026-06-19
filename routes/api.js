const express = require('express');
const { buildReconciliationHealth } = require('../lib/reconciliation');
const { buildUndepositedFundsHealth } = require('../lib/undepositedFunds');
const { buildUnappliedTransactionsHealth } = require('../lib/unappliedTransactions');
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

router.get('/api/unapplied-transactions', requireAuth, async (req, res) => {
  try {
    const data = await buildUnappliedTransactionsHealth(req.session);
    res.json({ ...data, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Unapplied transactions fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
