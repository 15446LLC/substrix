const express = require('express');
const { buildReconciliationHealth } = require('../lib/reconciliation');
const { buildUndepositedFundsHealth } = require('../lib/undepositedFunds');
const { buildUnappliedTransactionsHealth } = require('../lib/unappliedTransactions');
const { QboAuthExpiredError } = require('../lib/qbo');
const { logEvent } = require('../lib/events');
const { pool } = require('../lib/db');
const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.token) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function handleQboError(label, err, req, res) {
  if (err instanceof QboAuthExpiredError) {
    req.session.token = null;
    logEvent('auth_expired', req.session.realmId, label);
    return res.status(401).json({ error: err.message, reconnect: true });
  }
  console.error(`${label} error:`, err);
  logEvent('api_error', req.session.realmId, `${label}: ${err.message}`.slice(0, 500));
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


router.get('/api/report.pdf', requireAuth, async (req, res) => {
  try {
    const { generatePdfReport } = require('../lib/pdfReport');
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="substrix-report-${date}.pdf"`);
    logEvent('report_download', req.session.realmId);
    await generatePdfReport(req.session, res);
  } catch (err) {
    if (!res.headersSent) return handleQboError('PDF report', err, req, res);
    console.error('PDF report error mid-stream:', err);
    res.end();
  }
});

router.post('/api/feedback', requireAuth, express.json({ limit: '10kb' }), async (req, res) => {
  const message = (req.body?.message || '').trim().slice(0, 2000);
  if (!message) return res.status(400).json({ error: 'Message is required' });
  if (!pool) return res.status(503).json({ error: 'Feedback is unavailable right now' });
  try {
    await pool.query(
      'INSERT INTO feedback (realm_id, message) VALUES ($1, $2)',
      [req.session.realmId || null, message]
    );
    logEvent('feedback', req.session.realmId);
    res.json({ ok: true });
  } catch (err) {
    console.error('Feedback save failed:', err);
    res.status(500).json({ error: 'Could not save feedback' });
  }
});

module.exports = router;
