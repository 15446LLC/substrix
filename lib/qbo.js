const createOAuthClient = require('./oauthClient');

const BASE = {
  sandbox: 'https://sandbox-quickbooks.api.intuit.com',
  production: 'https://quickbooks.api.intuit.com',
};

// Thrown when the refresh token itself is dead (expired/revoked) — the user
// must reconnect via OAuth, this isn't a transient/retryable failure.
class QboAuthExpiredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QboAuthExpiredError';
  }
}

function baseUrl() {
  return BASE[process.env.ENVIRONMENT] || BASE.sandbox;
}

async function getValidToken(session) {
  const oauthClient = createOAuthClient();
  oauthClient.setToken(session.token);
  if (!oauthClient.isAccessTokenValid()) {
    try {
      const refreshed = await oauthClient.refresh();
      session.token = refreshed.getJson();
    } catch (err) {
      throw new QboAuthExpiredError(
        'Your QuickBooks connection has expired or was revoked. Please reconnect.'
      );
    }
  }
  return oauthClient.getToken().access_token;
}

async function qboGet(path, accessToken) {
  const res = await fetch(`${baseUrl()}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  const intuitTid = res.headers.get('intuit_tid');
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) {
      throw new QboAuthExpiredError(
        'Your QuickBooks connection has expired or was revoked. Please reconnect.'
      );
    }
    console.error(`QBO ${res.status} [intuit_tid: ${intuitTid}]: ${text}`);
    throw new Error(`QBO ${res.status} [intuit_tid: ${intuitTid}]: ${text}`);
  }
  return res.json();
}

async function fetchAccounts(session) {
  const token = await getValidToken(session);
  const query = encodeURIComponent(
    "SELECT * FROM Account WHERE AccountType IN ('Bank', 'Credit Card') AND Active = true MAXRESULTS 100"
  );
  const data = await qboGet(
    `/v3/company/${session.realmId}/query?query=${query}&minorversion=65`,
    token
  );
  return data.QueryResponse?.Account || [];
}

async function fetchGeneralLedgerByCleared(session, accountId, cleared, startDate, endDate) {
  const token = await getValidToken(session);
  const start = startDate || '2000-01-01';
  const end = endDate || new Date().toISOString().slice(0, 10);
  const path = `/v3/company/${session.realmId}/reports/GeneralLedger`
    + `?account=${accountId}`
    + `&start_date=${start}`
    + `&end_date=${end}`
    + `&cleared=${cleared}`
    + `&columns=tx_date,txn_type,subt_nat_amount`
    + `&minorversion=65`;
  return qboGet(path, token);
}

async function fetchAccountByName(session, name) {
  const token = await getValidToken(session);
  const query = encodeURIComponent(`SELECT * FROM Account WHERE Name = '${name}' MAXRESULTS 1`);
  const data = await qboGet(
    `/v3/company/${session.realmId}/query?query=${query}&minorversion=65`,
    token
  );
  return data.QueryResponse?.Account?.[0] || null;
}

// Fetches entities of the given type with TxnDate in [startDate, endDate),
// paginated sequentially (to avoid QBO throttling). Many fields useful for
// filtering (e.g. UnappliedAmt, Balance, DepositToAccountRef) aren't queryable
// in QBO's query language, so callers must filter client-side.
async function fetchEntitiesByDateRangeUncached(session, entity, startDate, endDate, maxPages = 20) {
  const token = await getValidToken(session);
  const dateFilter = endDate
    ? `TxnDate >= '${startDate}' AND TxnDate < '${endDate}'`
    : `TxnDate >= '${startDate}'`;
  const results = [];
  let page;
  for (page = 0; page < maxPages; page++) {
    const startPosition = page * 1000 + 1;
    const query = encodeURIComponent(
      `SELECT * FROM ${entity} WHERE ${dateFilter} ORDERBY TxnDate DESC STARTPOSITION ${startPosition} MAXRESULTS 1000`
    );
    const data = await qboGet(
      `/v3/company/${session.realmId}/query?query=${query}&minorversion=65`,
      token
    );
    const batch = data.QueryResponse?.[entity] || [];
    results.push(...batch);
    if (batch.length < 1000) break;
  }
  if (page === maxPages) {
    console.warn(
      `fetchEntitiesByDateRange: hit maxPages (${maxPages}) for ${entity} in [${startDate}, ${endDate || 'now'}) `
      + `— results may be truncated, missing data after the ${maxPages * 1000}th record.`
    );
  }
  return results;
}

// In-flight request cache: when undepositedFunds.js and unappliedTransactions.js
// both fetch the full Payment history during the same page load, this collapses
// identical concurrent calls into a single network round-trip instead of two.
// Cleared as soon as each call settles — this is request coalescing, not a
// persistent cache, so it doesn't reintroduce the storage tradeoffs decided
// against elsewhere in this app.
const inFlight = new Map();

function fetchEntitiesByDateRange(session, entity, startDate, endDate, maxPages = 20) {
  const key = `${session.realmId}:${entity}:${startDate}:${endDate}:${maxPages}`;
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = fetchEntitiesByDateRangeUncached(session, entity, startDate, endDate, maxPages)
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

// Fetches an entity's full history split into a recent window (cutoff365 to
// now) and everything older, in parallel. Shared by undepositedFunds.js and
// unappliedTransactions.js so the windowing strategy lives in one place.
async function fetchFullHistory(session, entity, cutoff365, windowStart = '2000-01-01') {
  const [recent, older] = await Promise.all([
    fetchEntitiesByDateRange(session, entity, cutoff365),
    fetchEntitiesByDateRange(session, entity, windowStart, cutoff365),
  ]);
  return [...recent, ...older];
}

module.exports = {
  fetchAccounts,
  fetchGeneralLedgerByCleared,
  fetchAccountByName,
  fetchEntitiesByDateRange,
  fetchFullHistory,
  getValidToken,
  qboGet,
  QboAuthExpiredError,
};
