const oauthClient = require('./oauthClient');

const BASE = {
  sandbox: 'https://sandbox-quickbooks.api.intuit.com',
  production: 'https://quickbooks.api.intuit.com',
};

function baseUrl() {
  return BASE[process.env.ENVIRONMENT] || BASE.sandbox;
}

async function getValidToken(session) {
  oauthClient.setToken(session.token);
  if (!oauthClient.isAccessTokenValid()) {
    const refreshed = await oauthClient.refresh();
    session.token = refreshed.getJson();
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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QBO ${res.status}: ${text}`);
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

async function fetchGeneralLedger(session, accountId, endDate) {
  const token = await getValidToken(session);
  const end = endDate || new Date().toISOString().slice(0, 10);
  const path = `/v3/company/${session.realmId}/reports/GeneralLedger`
    + `?account=${accountId}`
    + `&start_date=2000-01-01`
    + `&end_date=${end}`
    + `&columns=tx_date,txn_type,clr_status,subt_nat_amount`
    + `&minorversion=65`;
  return qboGet(path, token);
}

async function fetchAccountById(session, accountId) {
  const token = await getValidToken(session);
  const data = await qboGet(
    `/v3/company/${session.realmId}/account/${accountId}?minorversion=65`,
    token
  );
  return data.Account;
}

module.exports = { fetchAccounts, fetchGeneralLedger, fetchAccountById };
