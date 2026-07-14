# Substrix — Project Summary

## What Is Substrix?

Substrix is a web application that connects to QuickBooks Online (QBO) via the Intuit API and provides a **books health dashboard** — starting with reconciliation health as Module 1, with additional inspection modules to follow.

Originally named "Sentri" (a deliberate misspelling of "Sentry" — something standing watch over your books). Renamed to Substrix on 2026-06-19 after finding a live, conflicting USPTO trademark registration for "SENTRI" in overlapping classes (see Naming Update below). "Substrix" is an invented word with no dictionary meaning, chosen to avoid the same real-word-collision problem.

---

## Product Vision

A modular books health platform, built one inspection module at a time. Each module inspects a different dimension of record quality. Together they build toward a full books health score.

**Target market:** Listed on the Intuit App Marketplace for use by bookkeepers, accountants, and business owners across any QBO company.

---

## Module 1 — Reconciliation Health Dashboard

Displays a list of all accounts that require reconciliation (bank accounts, credit card accounts, undeposited funds, cash) with the following health indicators per account:

| Indicator | Green | Yellow | Red |
|---|---|---|---|
| Last reconciled date | Within last 30 days | Within last 3 months | More than 3 months ago |
| Reconciliation integrity | Still intact | — | Has been broken |
| Unreconciled transactions prior to last rec date | None | Within 30 days before rec date | More than 30 days before rec date |
| Sum of unreconciled transactions | Displayed | Displayed | Displayed |
| Earliest unreconciled transaction date | Displayed | Displayed | Displayed |

---

## Future Modules (Planned)

- AR Health (aging, unapplied payments, open credits)
- AP Health (aging, bills paid without a bill)
- Uncategorized / Suspense Transactions
- Chart of Accounts Quality
- Payroll Liability Health
- Journal Entry Quality
- Bank Feed Health
- Closing & Period Discipline
- Fixed Assets & Depreciation
- Inventory Health (if applicable)
- Tax Line Mapping

---

## Tech Stack

- **Backend:** Node.js
- **Authentication:** OAuth 2.0 via Intuit
- **Data:** QuickBooks Online Accounting API
- **Frontend:** HTML/CSS/JavaScript (or React)
- **Hosting:** TBD (Railway, Render, or Vercel — free tier to start)

---

## Build Sequence

1. ✅ Register on Intuit Developer Portal
2. ✅ Create Substrix app in developer dashboard
3. ✅ Retrieve development OAuth credentials (Client ID + Client Secret)
4. ✅ Configure Redirect URI: `http://localhost:3000/callback`
5. ✅ Set up Node.js project locally
6. ✅ Build OAuth 2.0 authentication flow
7. ✅ Connect to QBO sandbox (test data)
8. ✅ Build account-fetching logic
9. ✅ Build reconciliation data logic
10. ✅ Build unreconciled transaction logic + health scoring
11. ✅ Build frontend dashboard
12. ✅ Deploy to live URL — https://sentri-hefh.onrender.com (Render free tier)
13. ⬜ Submit to Intuit App Marketplace

---

## Status as of June 12, 2026

- **Deployed**: Substrix runs live at https://sentri-hefh.onrender.com (Render, free tier — spins down after inactivity, ~50s cold start).
- **GitHub**: source at github.com/15446LLC/sentri, `main` branch auto-deploys to Render.
- **Sandbox**: OAuth + dashboard verified end-to-end against Intuit sandbox company (4 accounts: Checking, Savings, Mastercard, Visa — all show "Never reconciled" since sandbox has no rec history).
- **Production credentials**: Unlocked via Intuit's App Details + Compliance questionnaire. Production Client ID/Secret added to Render env vars (`ENVIRONMENT=production`). Production redirect URI `https://sentri-hefh.onrender.com/callback` registered in Intuit.
- **Domain**: `sentri.15446.com` registered as host domain in Intuit App URLs (dev), but NOT yet pointed via DNS to Render — app URLs there are placeholders pending DNS setup. Live URL for now is the onrender.com one.
- **Not yet tested**: Real QBO account connection via production credentials (next step — click "Connect to QuickBooks" on the live URL and log in with real Intuit account).

### Known gaps / follow-ups
- Reconciliation integrity (broken-rec detection) — partially covered: the "Unreconciled Before Last Rec" check catches edited/un-reconciled transactions, but not outright deletions.
- ~~No handling for expired refresh tokens~~ — fixed: `QboAuthExpiredError` surfaces a reconnect prompt.
- ~~No CSRF state validation on OAuth callback~~ — fixed 2026-07-14: random state generated per /connect, verified on callback.
- `intuit_tid` is captured and logged on QBO errors.
- Support link (mailto) added to dashboard header.
- ~~Sessions are in-memory~~ — fixed 2026-07-14: Postgres-backed sessions via connect-pg-simple (Neon free tier), survive deploys/restarts. 30-day cookie.

### Update — 2026-07-14: Overpayment detection, security hardening, monitoring

**Unapplied module now uses aging reports.** The old vendor check (BillPayments with no linked Bill)
produced false positives on legitimate standalone payments and missed real overpayments. Replaced with
parsing `AgedPayableDetail` / `AgedReceivableDetail` for negative open balances — this catches vendor
overpayments (e.g. a check paid beyond the bill amount) and customer-side unapplied Deposits that the
entity fields (`Payment.UnappliedAmt`, `CreditMemo.Balance`, `VendorCredit.Balance`) can't see. Rows whose
types the entity checks already cover are skipped to avoid double-counting. NOTE: these two aging report
endpoints work fine with current API access (unlike ReconciliationDetail/TaxSummary, which 5020) — but the
code degrades to entity-only checks if a company's plan denies them. Column-key quirk: A/P aging uses
`subt_neg_open_bal`, A/R aging uses `subt_open_bal`.

**Security fixes from full code review:** XSS escaping on all QBO-sourced strings in the dashboard;
secure/httpOnly/sameSite session cookie in production (with `trust proxy` for Render); OAuth token
refreshes coalesced per realm (Intuit rotates refresh tokens — parallel refreshes could kill the session).

**Monitoring added.** Postgres (Neon free tier, `DATABASE_URL` env var on Render) now backs sessions and
an `events` table. Events logged: connect, connect_error, disconnect, dashboard_view, auth_expired,
api_error. Admin page at `/admin?key=ADMIN_KEY` (env var) shows companies connected, weekly activity,
error rollup, recent events. Verified end-to-end on the live app 2026-07-14. Rationale: Intuit's portal
shows API call volume and connection counts, but not per-company activity, return visits, or error
specifics — this fills that gap from day one.

### QBO API Reconciliation Data — Known Limitation (as of 2026-06-15)
The QBO API does not expose reconciliation dates or clearing status through any of the following:
- `Account` entity: `LastReconciledDate` field does not exist (confirmed via query — "Property not found")
- `GeneralLedger` report: `clr_status` column not returned even when requested
- `TransactionList` report: same — no clearing status column
- `Purchase`/transaction entities: no `ReconcileStatus` field on individual transactions
- `ReconciliationDetail` report: returns error 5020 "Permission Denied" (even with admin QBO user on Advanced plan)
- `ReconciliationSummary` report: same 5020 error

**Next step to investigate**: Whether the 5020 error is due to (a) stale OAuth token — try fresh reconnect immediately before calling the endpoint, or (b) Intuit app review requirement — certain report endpoints may be locked until the app completes marketplace review.

Several debug endpoints exist on the live app (accounts-raw, gl-raw, account-raw, rec-summary, purchase, etc.) — these should be cleaned up before any real users are added.

### Update — 2026-06-18: Found a working data source, but account filtering is broken

Confirmed via Intuit docs/community research that the `TransactionList` report supports a `cleared` query parameter (`Reconciled` / `Cleared` / `Uncleared`) that correctly identifies reconciliation status — this is the right building block (no ReconcileStatus field exists elsewhere in the API).

Rebuilt `lib/reconciliation.js` to fetch `TransactionList` filtered by `cleared=Reconciled` to derive last-rec-date, and `cleared=Uncleared` for the unreconciled list. Found and fixed two real bugs along the way:
1. `cleared=UnCleared` is an invalid enum — must be `Uncleared` (lowercase c).
2. `parseRows()` was indexing report columns by `col.ColType` (e.g. "Date", "Money") instead of the actual `ColKey` in `col.MetaData` (e.g. "tx_date", "subt_nat_amount") — this silently zeroed out every transaction's amount and dropped all rows. Fixed.

**Current blocker**: After those fixes, every account returns *identical* data (same date, same 6288 transactions, same $30M sum) — meaning the `account=` filter parameter on the `TransactionList` report is not actually being respected by QBO's API (confirmed via web research: this is a known limitation, Intuit's own community has reported `TransactionList`'s account filter is unreliable).

**In progress when session ended**: Testing whether the `GeneralLedger` report (which we proved DOES correctly filter by `account=`) also accepts the `cleared` parameter — if so, combining `GeneralLedger` + `cleared` filter could give us correct per-account reconciliation data. Added debug endpoint `/api/gl-cleared-test/:id` to test this — not yet confirmed working as of end of session (last user report was "still the same issue" i.e. still identical results across accounts, but this was before fully verifying the GL-based endpoint specifically).

**Next session should start by**: hitting `/api/gl-cleared-test/750` and `/api/gl-cleared-test/1150040088` (two different real Shakuff accounts) and comparing — if GL+cleared gives genuinely distinct results per account, rewire `reconciliation.js` to use `fetchGeneralLedgerByCleared` instead of `fetchTransactionListByCleared`.

### Update — 2026-06-19: Confirmed — GeneralLedger + cleared filter works, reconciliation logic rewired

Hit `/api/gl-cleared-test/750` (Chase 5508 Operating) and `/api/gl-cleared-test/1150040088` (Citi 9850) directly against the real company. Results were genuinely distinct per account — Chase 5508 returned thousands of transactions back to 2017, Citi 9850 returned exactly one transaction ($176.59 on 2025-12-26). Confirms `GeneralLedger`'s `account=` filter is respected even with `cleared` applied, unlike `TransactionList`.

`lib/reconciliation.js` now uses `fetchGeneralLedgerByCleared` (was `fetchTransactionListByCleared`). `fetchTransactionListByCleared` and the `/api/cleared-test/:id` and `/api/gl-cleared-test/:id` debug endpoints were removed from `lib/qbo.js` and `routes/api.js` now that the approach is confirmed.

**Not yet verified**: a full end-to-end run of `/api/reconciliation` against the real company with the new GL-based logic — should be the first thing checked next session.

### Update — 2026-06-19: Explored Sales Tax Health, hit the same report permission wall as reconciliation integrity

Goal was a cross-check: compare each Sales Tax Payable liability account's `CurrentBalance` against QBO's own computed tax liability, to catch when the recorded balance doesn't match what's actually owed.

Added `/api/debug-sales-tax` to probe what's available. Findings:
- `Account` (filtered by name like "Sales Tax"), `TaxAgency`, `TaxCode`, and `TaxRate` entity queries all work fine and return real data. The real company (Shakuff) has several Sales Tax Payable accounts across jurisdictions (NY, NJ, Truckee CA, a generic one, a Channel/PayPal one) — most are $0, but **Sales Tax - NY Payable has a real $668.92 balance** (on the `Sales Tax - NY Payable:Sales Tax Payable` sub-account, `CurrentBalanceWithSubAccounts` on the parent).
- Both `TaxSummary` and `TaxLiabilityReport` report endpoints return **`Permission Denied Error 5020`** — the exact same wall hit with `ReconciliationDetail`/`ReconciliationSummary` back on 2026-06-15. No QBO-computed tax liability number is accessible, so the cross-check as originally scoped isn't buildable with current API access.
- As with the reconciliation integrity case, unclear whether this 5020 is a stale-token issue, an Advanced-plan/app-review gate, or a hard API limitation — not yet investigated further.

**Scoped-down alternative discussed but not yet built**: since we can't get QBO's computed liability, fall back to checking what we *can* see — surface each Sales Tax Payable account's balance per jurisdiction, flag any negative balance (sign anomaly — a state owing the business money is suspicious), and flag balances that haven't changed in 90+ days (likely a missed filing/payment). This reuses the age-bucketing pattern from Modules 2/3 but can only flag "something looks off," not confirm the dollar amount is mathematically correct.

**Next session should start by**: deciding whether to build the scoped-down version (negative/stale balance checks only) or first investigate the 5020 wall further (e.g. try a fresh OAuth reconnect immediately before calling the report, to rule out a stale-token cause) — same open question as the reconciliation integrity report wall.

---

## Intuit Developer Portal

- **Portal:** developer.intuit.com
- **Workspace:** 15446
- **App Name:** Sentri (not yet renamed in the Intuit Developer Portal — see Naming Update below)
- **App ID:** 0c2db838-0028-49e3-b48e-45a3af7e0004
- **Status:** In Development
- **Redirect URI (Development):** `http://localhost:3000/callback`
- **Credentials:** Stored securely (do not commit to GitHub)

---

## Name Research (May 12, 2026) — for "Sentri"

| Check | Result |
|---|---|
| sentri.com | Taken |
| sentriapp.com | Taken |
| sentri.llc | Available |
| sentriapp.ai | Available |
| USPTO — SENTRI (Lockheed Martin) | Dead / Abandoned |
| USPTO — SENTRI (PYXUS Holdings) | ⚠️ Live / Registered — Classes 009, 035, 042, 044 |
| USPTO — SENTRI FIRE (Sentrinox AI) | Live / Pending — cybersecurity |
| Intuit App Store | No existing app named Sentri |

**Decision (superseded — see Naming Update below):** Proceed under the Sentri name through development.
Reassess trademark situation with a trademark attorney before launch. PYXUS Holdings registration is the
key item to review.

### Naming Update — 2026-06-19: Renamed from Sentri to Substrix

The live PYXUS Holdings registration above sits in classes 009/035/042/044 — directly overlapping this
app's SaaS/business-services category, and a real risk to a future Marketplace submission. Decided against
paying for formal attorney clearance at this pre-revenue stage; instead searched for and switched to a name
with no apparent conflicts. Checked informally via web search (not a substitute for legal clearance):
**Substrix** returned no fintech/SaaS/business hits — only an unrelated music producer's SoundCloud/YouTube
handle and an unrelated GitHub project (`kirisaki/substrix`, a Rust unikernel).

**Not yet done** (external accounts, outside code-level changes): GitHub repo rename, Render service
name/URL, Intuit Developer Portal app name and redirect URIs above. Code, docs, and the 15446.com landing
page were renamed to Substrix in this same session; the live app/repo/portal still say "Sentri" until those
external steps happen.

### Naming Update — 2026-06-23: External rename in progress

- [x] **GitHub repo renamed**: `15446LLC/sentri` → `15446LLC/substrix`. Local remote updated
  (`git remote set-url origin https://github.com/15446LLC/substrix.git`), confirmed working via `git fetch`.
- [x] **Render custom domain added**: `substrix.15446.com` added as a Custom Domain on the existing
  `sentri-hefh` Render service (chose custom domain over renaming the service itself — renaming the
  service would change its `.onrender.com` hostname, which is also exactly what the new domain's CNAME
  target points at, so renaming now would break the domain). DNS CNAME added at GoDaddy
  (`substrix` → `sentri-hefh.onrender.com`), verified in Render. SSL certificate was still issuing as of
  end of session — should be done by next session (Render/Let's Encrypt typically takes a few minutes,
  occasionally longer).
- **Deliberately left alone**: the Render service's "Name" field (still `sentri`) and the dashboard's
  cached "15446LLC / sentri" repo display — both cosmetic only, not visible to end users, and changing
  the service Name specifically risks breaking the new custom domain (see above).
- [x] **SSL cert issued**, `https://substrix.15446.com` confirmed live (2026-07-14)
- [x] **Intuit Developer Portal updated**: app renamed from "Sentri" to "Substrix"; Production redirect URI
  updated to `https://substrix.15446.com/callback`; Production App URLs (Host domain, Launch, Disconnect,
  Connect/Reconnect) updated to `substrix.15446.com`
- [x] **Render `REDIRECT_URI`** env var updated to `https://substrix.15446.com/callback`
- [x] **Landing page** "Connect to QuickBooks" link updated to `https://substrix.15446.com/connect`
- [x] **End-to-end verified**: full OAuth flow and all three dashboard modules confirmed working on the
  new domain with a real QBO company (2026-07-14)

---

## Notes

- The reconciliation integrity check (detecting whether a reconciliation has been broken after the fact) is the most technically complex feature and may move to v2.
- Claude Code (in the Claude app) is the primary development environment.
- Credentials (Client ID and Client Secret) are **never** to be committed to GitHub or shared.
