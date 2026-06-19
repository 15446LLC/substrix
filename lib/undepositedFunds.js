const { fetchAccountByName, fetchEntitiesByDateRange } = require('./qbo');
const { cutoffs, emptyBuckets, bucketFor } = require('./dateBuckets');

function isUnswept(payment) {
  return !(payment.LinkedTxn || []).some(lt => lt.TxnType === 'Deposit');
}

async function buildUndepositedFundsHealth(session) {
  const account = await fetchAccountByName(session, 'Undeposited Funds');
  if (!account) return null;

  const balance = account.CurrentBalance || 0;
  const buckets = emptyBuckets();

  if (balance === 0) {
    return {
      accountId: account.Id,
      balance,
      buckets,
      totalUnsweptSum: 0,
      balanceMatchesUnswept: true,
    };
  }

  const { cutoff30, cutoff365 } = cutoffs();

  // Two scoped queries: recent activity (cheap, bounded), and everything
  // older (only fetched because the balance told us something is unresolved).
  const [recentPayments, olderPayments] = await Promise.all([
    fetchEntitiesByDateRange(session, 'Payment', cutoff365),
    fetchEntitiesByDateRange(session, 'Payment', '2000-01-01', cutoff365),
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
