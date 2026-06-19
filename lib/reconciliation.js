const { fetchAccounts, fetchGeneralLedgerByCleared, QboAuthExpiredError } = require('./qbo');

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

function parseRows(report) {
  const columns = report.Columns?.Column || [];
  const idx = {};
  columns.forEach((col, i) => {
    const key = col.MetaData?.find(m => m.Name === 'ColKey')?.Value;
    if (key) idx[key] = i;
  });

  const txns = [];
  const topRows = report.Rows?.Row || [];

  function extractDataRows(rows) {
    for (const row of rows) {
      if (row.type === 'Data') {
        const c = row.ColData || [];
        const amount = parseFloat(c[idx['subt_nat_amount']]?.value || '0');
        if (isNaN(amount) || amount === 0) continue;
        txns.push({
          date: c[idx['tx_date']]?.value || '',
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

async function buildAccountHealth(session, account) {
  let lastRecDate = null;
  let unreconciledTxns = [];

  try {
    const reconciledReport = await fetchGeneralLedgerByCleared(session, account.Id, 'Reconciled');
    const clearedReport = await fetchGeneralLedgerByCleared(session, account.Id, 'Cleared');
    const unclearedReport = await fetchGeneralLedgerByCleared(session, account.Id, 'Uncleared');

    const reconciledTxns = parseRows(reconciledReport);
    const reconciledDates = reconciledTxns.map(t => t.date).filter(Boolean).sort();
    lastRecDate = reconciledDates[reconciledDates.length - 1] || null;

    // "Cleared" (matched to bank feed but not yet formally reconciled) and "Uncleared"
    // both count as not-reconciled for the purpose of catching pre-rec-date gaps
    const notReconciled = [...parseRows(clearedReport), ...parseRows(unclearedReport)];
    unreconciledTxns = lastRecDate
      ? notReconciled.filter(t => t.date && t.date <= lastRecDate)
      : [];
  } catch (err) {
    if (err instanceof QboAuthExpiredError) throw err;
    console.error(`Reconciliation fetch failed for account ${account.Name}:`, err.message);
  }

  const days = daysSince(lastRecDate);
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
}

async function buildReconciliationHealth(session) {
  const accounts = await fetchAccounts(session);

  // Fetch sequentially to avoid QBO API throttling (429 errors) on accounts with many requests
  const results = [];
  for (const account of accounts) {
    results.push(await buildAccountHealth(session, account));
  }

  return results;
}

module.exports = { buildReconciliationHealth };
