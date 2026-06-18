const express = require('express');
const { buildReconciliationHealth } = require('../lib/reconciliation');
const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.token) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

router.get('/api/cleared-test/:id', requireAuth, async (req, res) => {
  try {
    const { fetchTransactionListByCleared } = require('../lib/qbo');
    const report = await fetchTransactionListByCleared(req.session, req.params.id, 'Reconciled');
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/reconciliation', requireAuth, async (req, res) => {
  try {
    const data = await buildReconciliationHealth(req.session);
    res.json({ accounts: data, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Reconciliation fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
