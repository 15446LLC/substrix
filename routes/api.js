const express = require('express');
const { buildReconciliationHealth } = require('../lib/reconciliation');
const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.token) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

router.get('/api/accounts-raw', requireAuth, async (req, res) => {
  try {
    const { fetchAccounts, fetchAccountById } = require('../lib/qbo');
    const accounts = await fetchAccounts(req.session);
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/account-raw/:id', requireAuth, async (req, res) => {
  try {
    const { fetchAccountById } = require('../lib/qbo');
    const account = await fetchAccountById(req.session, req.params.id);
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/gl-raw/:id', requireAuth, async (req, res) => {
  try {
    const { fetchGeneralLedger } = require('../lib/qbo');
    const report = await fetchGeneralLedger(req.session, req.params.id, null);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/purchases-raw/:id', requireAuth, async (req, res) => {
  try {
    const { qboQuery } = require('../lib/qbo');
    const data = await qboQuery(req.session, `SELECT * FROM Purchase WHERE AccountRef.value = '${req.params.id}' MAXRESULTS 5`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/rec-report/:id', requireAuth, async (req, res) => {
  try {
    const { fetchReconciliationReport } = require('../lib/qbo');
    const report = await fetchReconciliationReport(req.session, req.params.id);
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
