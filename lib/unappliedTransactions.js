const { fetchEntitiesByDateRange } = require('./qbo');
const { cutoffs, emptyBuckets, bucketFor } = require('./dateBuckets');

const WINDOW_START = '2000-01-01';

async function fetchFullHistory(session, entity, cutoff365) {
  const [recent, older] = await Promise.all([
    fetchEntitiesByDateRange(session, entity, cutoff365),
    fetchEntitiesByDateRange(session, entity, WINDOW_START, cutoff365),
  ]);
  return [...recent, ...older];
}

function addToBuckets(buckets, items, getAmount, cutoff30, cutoff365) {
  for (const item of items) {
    const amount = getAmount(item);
    if (amount <= 0) continue;
    const bucket = bucketFor(item.TxnDate, cutoff30, cutoff365);
    buckets[bucket].count += 1;
    buckets[bucket].sum += amount;
  }
}

function hasLinkedBill(billPayment) {
  return (billPayment.Line || []).some(line =>
    (line.LinkedTxn || []).some(lt => lt.TxnType === 'Bill')
  );
}

const sumOf = buckets => Object.values(buckets).reduce((sum, b) => sum + b.sum, 0);

function buildLine(items, getAmount, cutoff30, cutoff365) {
  const buckets = emptyBuckets();
  addToBuckets(buckets, items, getAmount, cutoff30, cutoff365);
  return { buckets, totalSum: sumOf(buckets) };
}

async function buildUnappliedTransactionsHealth(session) {
  const { cutoff30, cutoff365 } = cutoffs();

  const [payments, creditMemos, vendorCredits, billPayments] = await Promise.all([
    fetchFullHistory(session, 'Payment', cutoff365),
    fetchFullHistory(session, 'CreditMemo', cutoff365),
    fetchFullHistory(session, 'VendorCredit', cutoff365),
    fetchFullHistory(session, 'BillPayment', cutoff365),
  ]);

  return {
    customer: {
      payments: buildLine(payments, p => p.UnappliedAmt || 0, cutoff30, cutoff365),
      creditMemos: buildLine(creditMemos, c => c.Balance || 0, cutoff30, cutoff365),
    },
    vendor: {
      vendorCredits: buildLine(vendorCredits, v => v.Balance || 0, cutoff30, cutoff365),
      unlinkedPayments: buildLine(
        billPayments.filter(bp => !hasLinkedBill(bp)),
        bp => bp.TotalAmt || 0,
        cutoff30,
        cutoff365
      ),
    },
  };
}

module.exports = { buildUnappliedTransactionsHealth };
