const { fetchFullHistory, fetchAgedReceivableDetail, fetchAgedPayableDetail } = require('./qbo');
const { cutoffs, emptyBuckets, bucketFor, sumOf } = require('./dateBuckets');

function addToBuckets(buckets, items, getAmount, cutoff30, cutoff365, collected, makeItem) {
  for (const item of items) {
    const amount = getAmount(item);
    if (amount <= 0) continue;
    const bucket = bucketFor(item.TxnDate, cutoff30, cutoff365);
    buckets[bucket].count += 1;
    buckets[bucket].sum += amount;
    if (collected) collected.push(makeItem(item, amount, bucket));
  }
}

function parseAgingOverpayments(report, nameColKey, skipTypes) {
  const columns = report.Columns?.Column || [];
  const idx = {};
  columns.forEach((col, i) => {
    const key = col.MetaData?.find(m => m.Name === 'ColKey')?.Value;
    if (key) idx[key] = i;
  });

  // A/P aging uses subt_neg_open_bal; A/R aging uses subt_open_bal
  const openBalIdx = idx['subt_neg_open_bal'] ?? idx['subt_open_bal'];

  const overpayments = [];

  function extractRows(rows) {
    for (const row of rows) {
      if (row.type === 'Data') {
        const c = row.ColData || [];
        const openBal = parseFloat(c[openBalIdx]?.value || '0');
        if (isNaN(openBal) || openBal >= 0) continue;
        const txnType = c[idx['txn_type']]?.value || '';
        // Types already counted via their own entity fields (Payment.UnappliedAmt,
        // CreditMemo.Balance, VendorCredit.Balance) are skipped to avoid double-counting
        if (skipTypes.includes(txnType)) continue;
        overpayments.push({
          date:   c[idx['tx_date']]?.value        || '',
          type:   txnType,
          doc:    c[idx['doc_num']]?.value        || '',
          name:   c[idx[nameColKey]]?.value       || '',
          amount: Math.abs(openBal),
        });
      }
      if (row.Rows?.Row) extractRows(row.Rows.Row);
    }
  }

  extractRows(report.Rows?.Row || []);
  return overpayments;
}

async function buildUnappliedTransactionsHealth(session) {
  const { cutoff30, cutoff365 } = cutoffs();

  const [payments, creditMemos, vendorCredits, arAging, apAging] = await Promise.all([
    fetchFullHistory(session, 'Payment', cutoff365),
    fetchFullHistory(session, 'CreditMemo', cutoff365),
    fetchFullHistory(session, 'VendorCredit', cutoff365),
    fetchAgedReceivableDetail(session),
    fetchAgedPayableDetail(session),
  ]);

  const customerBuckets = emptyBuckets();
  const customerItems = [];
  addToBuckets(customerBuckets, payments, p => p.UnappliedAmt || 0, cutoff30, cutoff365,
    customerItems, (p, amt, bucket) => ({ type: 'Payment', date: p.TxnDate, name: p.CustomerRef?.name || '', doc: p.DocNumber || '', amount: amt, bucket }));
  addToBuckets(customerBuckets, creditMemos, c => c.Balance || 0, cutoff30, cutoff365,
    customerItems, (c, amt, bucket) => ({ type: 'Credit Memo', date: c.TxnDate, name: c.CustomerRef?.name || '', doc: c.DocNumber || '', amount: amt, bucket }));

  const customerOverpayments = parseAgingOverpayments(arAging, 'cust_name', ['Payment', 'Credit Memo']);
  for (const op of customerOverpayments) {
    const bucket = bucketFor(op.date, cutoff30, cutoff365);
    customerBuckets[bucket].count += 1;
    customerBuckets[bucket].sum += op.amount;
    customerItems.push({ type: `${op.type} (unapplied)`, date: op.date, name: op.name, doc: op.doc, amount: op.amount, bucket });
  }

  const vendorBuckets = emptyBuckets();
  const vendorItems = [];
  addToBuckets(vendorBuckets, vendorCredits, v => v.Balance || 0, cutoff30, cutoff365,
    vendorItems, (v, amt, bucket) => ({ type: 'Vendor Credit', date: v.TxnDate, name: v.VendorRef?.name || '', doc: v.DocNumber || '', amount: amt, bucket }));

  const overpayments = parseAgingOverpayments(apAging, 'vend_name', ['Vendor Credit']);
  for (const op of overpayments) {
    const bucket = bucketFor(op.date, cutoff30, cutoff365);
    vendorBuckets[bucket].count += 1;
    vendorBuckets[bucket].sum += op.amount;
    vendorItems.push({ type: `${op.type} (overpayment)`, date: op.date, name: op.name, doc: op.doc, amount: op.amount, bucket });
  }

  customerItems.sort((a, b) => a.date.localeCompare(b.date));
  vendorItems.sort((a, b) => a.date.localeCompare(b.date));

  return {
    customer: { buckets: customerBuckets, totalSum: sumOf(customerBuckets), items: customerItems },
    vendor: { buckets: vendorBuckets, totalSum: sumOf(vendorBuckets), items: vendorItems },
  };
}

module.exports = { buildUnappliedTransactionsHealth };
