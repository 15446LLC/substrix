const express = require('express');
const { buildReconciliationHealth } = require('../lib/reconciliation');
const { buildUndepositedFundsHealth } = require('../lib/undepositedFunds');
const { buildUnappliedTransactionsHealth } = require('../lib/unappliedTransactions');
const { QboAuthExpiredError } = require('../lib/qbo');
const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.token) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function handleQboError(label, err, req, res) {
  if (err instanceof QboAuthExpiredError) {
    req.session.token = null;
    return res.status(401).json({ error: err.message, reconnect: true });
  }
  console.error(`${label} error:`, err);
  res.status(500).json({ error: err.message });
}

router.get('/api/reconciliation', requireAuth, async (req, res) => {
  try {
    const data = await buildReconciliationHealth(req.session);
    res.json({ accounts: data, fetchedAt: new Date().toISOString() });
  } catch (err) {
    handleQboError('Reconciliation fetch', err, req, res);
  }
});

router.get('/api/undeposited-funds', requireAuth, async (req, res) => {
  try {
    const data = await buildUndepositedFundsHealth(req.session);
    res.json({ ...data, fetchedAt: new Date().toISOString() });
  } catch (err) {
    handleQboError('Undeposited funds fetch', err, req, res);
  }
});

router.get('/api/unapplied-transactions', requireAuth, async (req, res) => {
  try {
    const data = await buildUnappliedTransactionsHealth(req.session);
    res.json({ ...data, fetchedAt: new Date().toISOString() });
  } catch (err) {
    handleQboError('Unapplied transactions fetch', err, req, res);
  }
});

module.exports = router;
