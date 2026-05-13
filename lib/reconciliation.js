const { fetchAccounts, fetchGeneralLedger } = require('./qbo');

function daysSince(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function recDateColor(days) {
  if (days === null) return 'red';
  if (days <= 30) return 'green';
  if (days <= 90) return 'yellow';
  return 'red';
}

function parseGLRows(report) {
  const columns = report.Columns?.Column || [];
  const idx = {};
  columns.forEach((col, i) => { idx[col.ColType] = i; });

  const txns = [];
  const topRows = report.Rows?.Row || [];

  function extractDataRows(rows) {
    for (const row of rows) {
      if (row.type === 'Data') {
        const c = row.ColData || [];
        const clr = c[idx['clr_status']]?.value || '';
        const amount = parseFloat(c[idx['subt_nat_amount']]?.value || '0');
        if (isNaN(amount) || amount === 0) continue;
        txns.push({
          date: c[idx['tx_date']]?.value || '',
          clrStatus: clr,
          amount,
        });
      }
      if (row.Rows?.Row) extractDataRows(row.Rows.Row);
    }
  }

  extractDataRows(topRows);
  return txns;
}

function unreconciledColor(earliest, lastRecDate) {
  if (!earliest) return 'green';
  if (!lastRecDate) return 'red';
  const daysBefore = Math.floor(
    (new Date(lastRecDate) - new Date(earliest)) / (1000 * 60 * 60 * 24)
  );
  if (daysBefore <= 30) return 'yellow';
  return 'red';
}

async function buildReconciliationHealth(session) {
  const accounts = await fetchAccounts(session);

  const results = await Promise.all(
    accounts.map(async (account) => {
      const lastRecDate = account.LastReconciledDate || null;
      const days = daysSince(lastRecDate);

      let unreconciledTxns = [];
      try {
        const glReport = await fetchGeneralLedger(session, account.Id, lastRecDate);
        const allTxns = parseGLRows(glReport);
        // Transactions before (or on) the last rec date that are not reconciled
        unreconciledTxns = allTxns.filter(t => t.clrStatus !== 'R');
      } catch (err) {
        // GL fetch failed — surface the error but don't crash the whole dashboard
        console.error(`GL fetch failed for account ${account.Name}:`, err.message);
      }

      const unreconciledSum = unreconciledTxns.reduce((sum, t) => sum + t.amount, 0);
      const dates = unreconciledTxns.map(t => t.date).filter(Boolean).sort();
      const earliestDate = dates[0] || null;

      return {
        id: account.Id,
        name: account.Name,
        type: account.AccountType,
        lastRecDate,
        daysSinceRec: days,
        recDateColor: recDateColor(days),
        unreconciledCount: unreconciledTxns.length,
        unreconciledSum,
        earliestUnreconciledDate: earliestDate,
        unreconciledColor: unreconciledColor(earliestDate, lastRecDate),
      };
    })
  );

  return results;
}

module.exports = { buildReconciliationHealth };
