const express = require('express');
const { buildReconciliationHealth } = require('../lib/reconciliation');
const { buildUndepositedFundsHealth } = require('../lib/undepositedFunds');
const { buildUnappliedTransactionsHealth } = require('../lib/unappliedTransactions');
const { QboAuthExpiredError, getValidToken, qboGet } = require('../lib/qbo');
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

// Temporary debug endpoint: probe what's available for a sales tax check —
// liability account balance, TaxAgency/TaxCode/TaxRate entities, and whether
// any tax-summary-style report endpoint exists/works.
router.get('/api/debug-sales-tax', requireAuth, async (req, res) => {
  try {
    const token = await getValidToken(req.session);
    const realmId = req.session.realmId;

    const tryQuery = async (label, queryStr) => {
      try {
        const query = encodeURIComponent(queryStr);
        const data = await qboGet(`/v3/company/${realmId}/query?query=${query}&minorversion=65`, token);
        return { label, ok: true, data: data.QueryResponse };
      } catch (err) {
        return { label, ok: false, error: err.message };
      }
    };

    const tryReport = async (label, path) => {
      try {
        const data = await qboGet(`/v3/company/${realmId}/reports/${path}&minorversion=65`, token);
        return { label, ok: true, data };
      } catch (err) {
        return { label, ok: false, error: err.message };
      }
    };

    const results = await Promise.all([
      tryQuery('Account WHERE Name like Sales Tax', "SELECT * FROM Account WHERE Name LIKE '%Sales Tax%' MAXRESULTS 10"),
      tryQuery('TaxAgency', 'SELECT * FROM TaxAgency MAXRESULTS 10'),
      tryQuery('TaxCode', 'SELECT * FROM TaxCode MAXRESULTS 20'),
      tryQuery('TaxRate', 'SELECT * FROM TaxRate MAXRESULTS 20'),
      tryReport('TaxSummary report', 'TaxSummary?'),
      tryReport('TaxLiabilityReport', 'TaxLiabilityReport?'),
    ]);

    res.json({ results });
  } catch (err) {
    handleQboError('Debug sales tax', err, req, res);
  }
});

module.exports = router;
