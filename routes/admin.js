const express = require('express');
const crypto = require('crypto');
const { pool } = require('../lib/db');
const router = express.Router();

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function keyMatches(provided) {
  const expected = process.env.ADMIN_KEY;
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.get('/admin', async (req, res) => {
  if (!keyMatches(req.query.key)) return res.status(404).send('Not found');
  if (!pool) return res.send('No database configured — event logging is off.');

  try {
    const [totals, weekly, errors, recent] = await Promise.all([
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
    ]);

    const t = totals.rows[0];
    const weeklyRows = weekly.rows.map(r =>
      `<tr><td>${esc(r.week.toISOString().slice(0, 10))}</td><td>${r.connects}</td><td>${r.active_realms}</td></tr>`).join('');
    const errorRows = errors.rows.map(r =>
      `<tr><td>${esc(r.type)}</td><td>${esc(r.detail)}</td><td>${r.n}</td><td>${esc(r.last_seen.toISOString().slice(0, 16).replace('T', ' '))}</td></tr>`).join('');
    const recentRows = recent.rows.map(r =>
      `<tr><td>${esc(r.created_at.toISOString().slice(0, 16).replace('T', ' '))}</td><td>${esc(r.type)}</td><td>${esc(r.realm_id)}</td><td>${esc(r.detail)}</td></tr>`).join('');

    res.send(`<!DOCTYPE html>
<html><head><title>Substrix Admin</title><meta charset="utf-8">
<style>
  body { font-family: system-ui, sans-serif; max-width: 900px; margin: 32px auto; padding: 0 16px; color: #1a1a1a; }
  h1 { font-size: 1.3rem; } h2 { font-size: 1rem; margin-top: 28px; }
  table { border-collapse: collapse; width: 100%; font-size: 0.85rem; margin-top: 8px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #eee; }
  th { background: #f7f7f7; font-size: 0.75rem; text-transform: uppercase; }
  .stats { display: flex; gap: 24px; margin-top: 12px; }
  .stat { background: #f7f7f9; border-radius: 8px; padding: 14px 20px; }
  .stat b { display: block; font-size: 1.4rem; }
</style></head><body>
<h1>Substrix Admin</h1>
<div class="stats">
  <div class="stat"><b>${t.realms_ever}</b>companies ever connected</div>
  <div class="stat"><b>${t.connects}</b>total connects</div>
  <div class="stat"><b>${t.views}</b>dashboard views</div>
</div>
<h2>Weekly activity (8 weeks)</h2>
<table><tr><th>Week of</th><th>Connects</th><th>Active companies</th></tr>${weeklyRows || '<tr><td colspan=3>No data yet</td></tr>'}</table>
<h2>Errors (30 days)</h2>
<table><tr><th>Type</th><th>Detail</th><th>Count</th><th>Last seen</th></tr>${errorRows || '<tr><td colspan=4>None 🎉</td></tr>'}</table>
<h2>Recent events</h2>
<table><tr><th>Time (UTC)</th><th>Type</th><th>Realm</th><th>Detail</th></tr>${recentRows || '<tr><td colspan=4>No events yet</td></tr>'}</table>
</body></html>`);
  } catch (err) {
    console.error('Admin page error:', err);
    res.status(500).send('Error loading admin data.');
  }
});

module.exports = router;
