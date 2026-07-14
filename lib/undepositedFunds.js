const { fetchAccountByName, fetchFullHistory } = require('./qbo');
const { cutoffs, emptyBuckets, bucketFor, sumOf } = require('./dateBuckets');

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

  // Only fetched because the balance told us something is unresolved.
  const allPayments = (await fetchFullHistory(session, 'Payment', cutoff365))
    .filter(p => p.DepositToAccountRef?.value === account.Id)
    .filter(isUnswept);

  const items = [];
  for (const p of allPayments) {
    const bucket = bucketFor(p.TxnDate, cutoff30, cutoff365);
    buckets[bucket].count += 1;
    buckets[bucket].sum += p.TotalAmt || 0;
    items.push({
      type: 'Payment',
      date: p.TxnDate,
      name: p.CustomerRef?.name || '',
      doc: p.DocNumber || '',
      amount: p.TotalAmt || 0,
      bucket,
    });
  }
  items.sort((a, b) => a.date.localeCompare(b.date));

  const totalUnsweptSum = sumOf(buckets);

  return {
    accountId: account.Id,
    balance,
    buckets,
    items,
    totalUnsweptSum,
    balanceMatchesUnswept: Math.abs(balance - totalUnsweptSum) < 0.01,
  };
}

module.exports = { buildUndepositedFundsHealth };
