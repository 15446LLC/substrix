const express = require('express');
const crypto = require('crypto');
const { pool } = require('../lib/db');
const router = express.Router();

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function passwordMatches(provided) {
  const expected = process.env.ADMIN_KEY;
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// The admin hub is served only on the admin hostname (admin.15446.com).
// Local dev: use http://admin.localhost:3000 — browsers resolve it natively.
function isAdminHost(req) {
  return (req.hostname || '').startsWith('admin.');
}

function requireAdminHost(req, res, next) {
  if (!isAdminHost(req)) return next('route');
  next();
}

function requireAdminAuth(req, res, next) {
  if (req.session.isAdmin) return next();
  res.redirect('/admin/login');
}

function page(title, body) {
  return `<!DOCTYPE html>
<html><head><title>${esc(title)}</title><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<style>
  body { font-family: system-ui, sans-serif; max-width: 960px; margin: 32px auto; padding: 0 16px; color: #1a1a1a; background: #f5f7fa; }
  h1 { font-size: 1.3rem; } h2 { font-size: 1rem; margin-top: 28px; }
  table { border-collapse: collapse; width: 100%; font-size: 0.85rem; margin-top: 8px; background: #fff; border-radius: 8px; overflow: hidden; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #eee; }
  th { background: #f7f7f7; font-size: 0.75rem; text-transform: uppercase; }
  .stats { display: flex; gap: 24px; margin-top: 12px; flex-wrap: wrap; }
  .stat { background: #fff; border-radius: 8px; padding: 14px 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
  .stat b { display: block; font-size: 1.4rem; }
  .topbar { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
  .topbar a { font-size: 0.8rem; color: #666; }
  .apps { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; margin-top: 16px; }
  .app-card { display: block; background: #fff; border-radius: 10px; padding: 20px; text-decoration: none; color: inherit; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
  .app-card:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.12); }
  .app-card h3 { font-size: 1rem; margin-bottom: 4px; }
  .app-card p { font-size: 0.82rem; color: #666; }
  .login-card { background: #fff; border-radius: 10px; padding: 32px; max-width: 360px; margin: 80px auto; box-shadow: 0 2px 12px rgba(0,0,0,0.08); text-align: center; }
  input[type=password] { width: 100%; padding: 10px 12px; font-size: 0.9rem; border: 1px solid #ccc; border-radius: 6px; margin: 14px 0; }
  button { background: #1a1a1a; color: #fff; border: none; border-radius: 6px; padding: 10px 24px; font-size: 0.9rem; cursor: pointer; }
  .err { color: #b02a37; font-size: 0.82rem; }
</style></head><body>${body}</body></html>`;
}

router.get('/admin/login', requireAdminHost, (req, res) => {
  if (req.session.isAdmin) return res.redirect('/');
  const failed = req.query.failed
    ? '<p class="err">Wrong password. Try again.</p>' : '';
  res.send(page('15446 Admin — Sign in', `
    <div class="login-card">
      <h1>15446 Admin</h1>
      ${failed}
      <form method="POST" action="/admin/login">
        <input type="password" name="password" placeholder="Admin password" autofocus autocomplete="current-password" />
        <button type="submit">Sign in</button>
      </form>
    </div>`));
});

router.post('/admin/login', requireAdminHost, express.urlencoded({ extended: false }), (req, res) => {
  if (passwordMatches(req.body.password)) {
    req.session.isAdmin = true;
    return res.redirect('/');
  }
  setTimeout(() => res.redirect('/admin/login?failed=1'), 800);
});

router.get('/admin/logout', requireAdminHost, (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// Hub: one card per app. New apps get a card here — either linking out to
// their own admin, or to a panel route added below like /substrix.
router.get('/', requireAdminHost, requireAdminAuth, (req, res) => {
  res.send(page('15446 Admin', `
    <div class="topbar"><h1>15446 Admin</h1><span><a href="https://15446.com">15446.com</a> &nbsp; <a href="/admin/logout">Sign out</a></span></div>
    <div class="apps">
      <a class="app-card" href="/substrix">
        <h3>Substrix</h3>
        <p>Books health monitoring for QuickBooks Online — companies, activity, errors.</p>
      </a>
    </div>`));
});

router.get('/substrix', requireAdminHost, requireAdminAuth, async (req, res) => {
  if (!pool) return res.send(page('Substrix Admin', '<p>No database configured — event logging is off.</p>'));

  try {
    const [totals, weekly, errors, recent, companies] = await Promise.all([
      pool.query(`
        SELECT
          count(DISTINCT realm_id) FILTER (WHERE type = 'connect')  AS realms_ever,
          count(*) FILTER (WHERE type = 'connect')                  AS connects,
          count(*) FILTER (WHERE type = 'dashboard_view')           AS views
        FROM events
      `),
      pool.query(`
        SELECT date_trunc('week', created_at)::date AS week,
               count(*) FILTER (WHERE type = 'connect')        AS connects,
               count(DISTINCT realm_id) FILTER (WHERE type = 'dashboard_view') AS active_realms
        FROM events
        WHERE created_at > now() - interval '8 weeks'
        GROUP BY 1 ORDER BY 1 DESC
      `),
      pool.query(`
        SELECT type, detail, count(*) AS n, max(created_at) AS last_seen
        FROM events
        WHERE type IN ('api_error', 'connect_error') AND created_at > now() - interval '30 days'
        GROUP BY 1, 2 ORDER BY n DESC LIMIT 20
      `),
      pool.query(`
        SELECT created_at, type, realm_id, detail
        FROM events ORDER BY id DESC LIMIT 50
      `),
      pool.query(`
        SELECT c.realm_id, c.company_name, c.email, c.city, c.state,
               c.first_connected, c.last_seen,
               count(e.id) FILTER (WHERE e.type = 'dashboard_view') AS views
        FROM companies c
        LEFT JOIN events e ON e.realm_id = c.realm_id
        GROUP BY c.realm_id
        ORDER BY c.last_seen DESC
      `),
    ]);

    const t = totals.rows[0];
    const fmtDay = d => d.toISOString().slice(0, 10);
    const fmtMin = d => d.toISOString().slice(0, 16).replace('T', ' ');
    const companyRows = companies.rows.map(r =>
      `<tr><td>${esc(r.company_name || r.realm_id)}</td><td>${esc(r.email)}</td><td>${esc([r.city, r.state].filter(Boolean).join(', '))}</td><td>${fmtDay(r.first_connected)}</td><td>${fmtDay(r.last_seen)}</td><td>${r.views}</td></tr>`).join('');
    const weeklyRows = weekly.rows.map(r =>
      `<tr><td>${esc(fmtDay(r.week))}</td><td>${r.connects}</td><td>${r.active_realms}</td></tr>`).join('');
    const errorRows = errors.rows.map(r =>
      `<tr><td>${esc(r.type)}</td><td>${esc(r.detail)}</td><td>${r.n}</td><td>${esc(fmtMin(r.last_seen))}</td></tr>`).join('');
    const recentRows = recent.rows.map(r =>
      `<tr><td>${esc(fmtMin(r.created_at))}</td><td>${esc(r.type)}</td><td>${esc(r.realm_id)}</td><td>${esc(r.detail)}</td></tr>`).join('');

    res.send(page('Substrix Admin', `
      <div class="topbar"><h1>Substrix</h1><span><a href="/">← All apps</a> &nbsp; <a href="/admin/logout">Sign out</a></span></div>
      <div class="stats">
        <div class="stat"><b>${t.realms_ever}</b>companies ever connected</div>
        <div class="stat"><b>${t.connects}</b>total connects</div>
        <div class="stat"><b>${t.views}</b>dashboard views</div>
      </div>
      <h2>Companies</h2>
      <table><tr><th>Company</th><th>Email</th><th>Location</th><th>First connected</th><th>Last seen</th><th>Views</th></tr>${companyRows || '<tr><td colspan=6>None yet</td></tr>'}</table>
      <h2>Weekly activity (8 weeks)</h2>
      <table><tr><th>Week of</th><th>Connects</th><th>Active companies</th></tr>${weeklyRows || '<tr><td colspan=3>No data yet</td></tr>'}</table>
      <h2>Errors (30 days)</h2>
      <table><tr><th>Type</th><th>Detail</th><th>Count</th><th>Last seen</th></tr>${errorRows || '<tr><td colspan=4>None 🎉</td></tr>'}</table>
      <h2>Recent events</h2>
      <table><tr><th>Time (UTC)</th><th>Type</th><th>Realm</th><th>Detail</th></tr>${recentRows || '<tr><td colspan=4>No events yet</td></tr>'}</table>`));
  } catch (err) {
    console.error('Admin page error:', err);
    res.status(500).send('Error loading admin data.');
  }
});

// Legacy path on the app domain: send to the hub
router.get('/admin', (req, res) => {
  if (isAdminHost(req)) return res.redirect('/');
  res.redirect('https://admin.15446.com');
});

module.exports = router;
