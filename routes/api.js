const express = require('express');
const { buildReconciliationHealth } = require('../lib/reconciliation');
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

// Temporary debug endpoint: check whether Payment.LinkedTxn correctly identifies
// payments still sitting in Undeposited Funds (no linked Deposit).
router.get('/api/debug-undeposited-funds', requireAuth, async (req, res) => {
  try {
    const token = await getValidToken(req.session);
    const accountQuery = encodeURIComponent(
      "SELECT * FROM Account WHERE Name = 'Undeposited Funds' MAXRESULTS 10"
    );
    const accountData = await qboGet(
      `/v3/company/${req.session.realmId}/query?query=${accountQuery}&minorversion=65`,
      token
    );
    const account = accountData.QueryResponse?.Account?.[0];
    if (!account) return res.status(404).json({ error: 'Undeposited Funds account not found' });

    // DepositToAccountRef isn't queryable in QBO's query language, so fetch
    // payments page by page (sequentially, to avoid QBO throttling) and filter
    // client-side. `pages` query param controls how far back to look (1000/page).
    const maxPages = Math.min(parseInt(req.query.pages, 10) || 1, 20);
    const allPayments = [];
    for (let page = 0; page < maxPages; page++) {
      const startPosition = page * 1000 + 1;
      const paymentQuery = encodeURIComponent(
        `SELECT * FROM Payment ORDERBY TxnDate DESC STARTPOSITION ${startPosition} MAXRESULTS 1000`
      );
      const paymentData = await qboGet(
        `/v3/company/${req.session.realmId}/query?query=${paymentQuery}&minorversion=65`,
        token
      );
      const batch = paymentData.QueryResponse?.Payment || [];
      allPayments.push(...batch);
      if (batch.length < 1000) break;
    }
    const payments = allPayments.filter(p => p.DepositToAccountRef?.value === account.Id);

    const unswept = payments.filter(p => !(p.LinkedTxn || []).some(lt => lt.TxnType === 'Deposit'));

    res.json({
      account,
      pagesFetched: Math.ceil(allPayments.length / 1000) || 0,
      totalPaymentsFetched: allPayments.length,
      undepositedFundsPayments: payments.length,
      unsweptCount: unswept.length,
      unsweptSum: unswept.reduce((sum, p) => sum + (p.TotalAmt || 0), 0),
      unswept: unswept.slice(0, 50).map(p => ({
        id: p.Id,
        date: p.TxnDate,
        amount: p.TotalAmt,
        customer: p.CustomerRef?.name,
        linkedTxn: p.LinkedTxn,
      })),
    });
  } catch (err) {
    console.error('Debug undeposited funds error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
