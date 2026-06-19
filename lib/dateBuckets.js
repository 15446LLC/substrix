function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function cutoffs(today = new Date()) {
  return {
    cutoff30: isoDate(new Date(today - 30 * 24 * 60 * 60 * 1000)),
    cutoff365: isoDate(new Date(today - 365 * 24 * 60 * 60 * 1000)),
  };
}

function emptyBuckets() {
  return {
    last30Days: { count: 0, sum: 0 },
    last30DaysTo12Months: { count: 0, sum: 0 },
    over12Months: { count: 0, sum: 0 },
  };
}

function bucketFor(txnDate, cutoff30, cutoff365) {
  if (txnDate >= cutoff30) return 'last30Days';
  if (txnDate >= cutoff365) return 'last30DaysTo12Months';
  return 'over12Months';
}

module.exports = { isoDate, cutoffs, emptyBuckets, bucketFor };
