const { fetchFullHistory } = require('./qbo');
const { cutoffs, emptyBuckets, bucketFor, sumOf } = require('./dateBuckets');

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

async function buildUnappliedTransactionsHealth(session) {
  const { cutoff30, cutoff365 } = cutoffs();

  const [payments, creditMemos, vendorCredits, billPayments] = await Promise.all([
    fetchFullHistory(session, 'Payment', cutoff365),
    fetchFullHistory(session, 'CreditMemo', cutoff365),
    fetchFullHistory(session, 'VendorCredit', cutoff365),
    fetchFullHistory(session, 'BillPayment', cutoff365),
  ]);

  const customerBuckets = emptyBuckets();
  addToBuckets(customerBuckets, payments, p => p.UnappliedAmt || 0, cutoff30, cutoff365);
  addToBuckets(customerBuckets, creditMemos, c => c.Balance || 0, cutoff30, cutoff365);

  const vendorBuckets = emptyBuckets();
  addToBuckets(vendorBuckets, vendorCredits, v => v.Balance || 0, cutoff30, cutoff365);
  // Bucketed by TxnDate as an approximation of staleness, same as vendorCredits
  // above — but for an unlinked BillPayment, TxnDate is when the payment was
  // made, not when it became orphaned. A payment that was always meant to
  // stand alone (no bill) reads identically to one that just lost its bill
  // link yesterday. Treat the "over 12 months" severity label loosely for
  // this bucket specifically.
  addToBuckets(
    vendorBuckets,
    billPayments.filter(bp => !hasLinkedBill(bp)),
    bp => bp.TotalAmt || 0,
    cutoff30,
    cutoff365
  );

  return {
    customer: { buckets: customerBuckets, totalSum: sumOf(customerBuckets) },
    vendor: { buckets: vendorBuckets, totalSum: sumOf(vendorBuckets) },
  };
}

module.exports = { buildUnappliedTransactionsHealth };
