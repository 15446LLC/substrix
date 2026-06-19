const { fetchAccountByName, fetchPaymentsByDateRange } = require('./qbo');

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function isUnswept(payment) {
  return !(payment.LinkedTxn || []).some(lt => lt.TxnType === 'Deposit');
}

function bucketFor(txnDate, cutoff30, cutoff365) {
  if (txnDate >= cutoff30) return 'last30Days';
  if (txnDate >= cutoff365) return 'last30DaysTo12Months';
  return 'over12Months';
}

async function buildUndepositedFundsHealth(session) {
  const account = await fetchAccountByName(session, 'Undeposited Funds');
  if (!account) return null;

  const balance = account.CurrentBalance || 0;

  const buckets = {
    last30Days: { count: 0, sum: 0 },
    last30DaysTo12Months: { count: 0, sum: 0 },
    over12Months: { count: 0, sum: 0 },
  };

  if (balance === 0) {
    return {
      accountId: account.Id,
      balance,
      buckets,
      totalUnsweptSum: 0,
      balanceMatchesUnswept: true,
    };
  }

  const today = new Date();
  const cutoff30 = isoDate(new Date(today - 30 * 24 * 60 * 60 * 1000));
  const cutoff365 = isoDate(new Date(today - 365 * 24 * 60 * 60 * 1000));

  // Two scoped queries: recent activity (cheap, bounded), and everything
  // older (only fetched because the balance told us something is unresolved).
  const [recentPayments, olderPayments] = await Promise.all([
    fetchPaymentsByDateRange(session, cutoff365),
    fetchPaymentsByDateRange(session, '2000-01-01', cutoff365),
  ]);

  const allPayments = [...recentPayments, ...olderPayments]
    .filter(p => p.DepositToAccountRef?.value === account.Id)
    .filter(isUnswept);

  for (const p of allPayments) {
    const bucket = bucketFor(p.TxnDate, cutoff30, cutoff365);
    buckets[bucket].count += 1;
    buckets[bucket].sum += p.TotalAmt || 0;
  }

  const totalUnsweptSum = Object.values(buckets).reduce((sum, b) => sum + b.sum, 0);

  return {
    accountId: account.Id,
    balance,
    buckets,
    totalUnsweptSum,
    balanceMatchesUnswept: Math.abs(balance - totalUnsweptSum) < 0.01,
  };
}

module.exports = { buildUndepositedFundsHealth };
