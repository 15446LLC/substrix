# Substrix — Product Roadmap

## Mission
Substrix validates that the underlying QBO data is sound *before* anyone — a bookkeeper, an owner, or a higher-level analytics tool — trusts a report built on it. Reconciled books are not the same as correct books: a register can pass reconciliation and still produce a wrong reported balance if unreconciled transactions exist dated before the last reconciliation (especially far in the past) — the rec only proves the balance was right as of that date, not that nothing was altered before it. Every module should be judged by how directly it catches data that would silently corrupt a financial report.

## Module 1 — Reconciliation Health Dashboard (current)
Status: built and verified end-to-end against a real company with the GeneralLedger-based logic. Next: pre-reconciliation unreconciled transactions check.

- [x] OAuth 2.0 connection to QBO (sandbox + production)
- [x] Account-fetching logic
- [x] Reconciliation data logic (GeneralLedger + `cleared` filter)
- [x] Unreconciled transaction logic + health scoring
- [x] Frontend dashboard
- [x] Deploy to live URL (Render)
- [x] Full end-to-end verification of `/api/reconciliation` against real company data
- [ ] **Pre-reconciliation unreconciled transactions check** — flag, as its own named validation check (not just a sub-indicator), any unreconciled transaction dated before the account's last reconciliation date. This is core to the mission: it's the case where reconciled-looking books still have an unverified/wrong balance, and severity should scale with how far back the transaction is.
- [x] **Reconciliation integrity check** — decided against building a separate DB-backed snapshot/diff system (would require storing the entire reconciled history per account, growing unboundedly). Instead, reusing the existing "unreconciled transactions before last rec date" check as the integrity proxy: when a previously-reconciled transaction is edited or un-reconciled, it reverts to Cleared/Uncleared with a date before the last rec, which already surfaces in that check — no new infrastructure needed. **Known gap**: outright *deletion* of a previously-reconciled transaction leaves no trace in any report and cannot be caught without historical storage — left as an accepted limitation, not solved.
- [ ] Submit to Intuit App Marketplace

## Module 2 — Undeposited Funds Hygiene
Status: built and live on the dashboard, verified against a real company (clean $0 balance result).

Payments sitting in Undeposited Funds instead of matched to a deposit is one of the most common QBO
data-quality issues, and it directly misstates cash on the balance sheet. Promoted from future-modules #7
to its own module on 2026-06-19 after live debugging revealed it needs a different detection mechanism
than Module 1.

- [x] Confirmed the bank-rec `cleared` field (Reconciled/Cleared/Uncleared) does **not** track deposit-matching
  for this account — every Payment line, including ones from 2011, came back `Uncleared` via GeneralLedger
  regardless of the `R` checkmark shown in QBO's own Undeposited Funds register. The `R` in the UI reflects
  a Payment's `LinkedTxn` to a Deposit, not the `cleared` enum.
- [x] Detection logic: query `Payment` entities, filter to ones with `DepositToAccountRef` pointing at
  Undeposited Funds (not queryable server-side, filtered client-side), flag any with no `LinkedTxn` of
  `TxnType: Deposit` as unswept.
- [x] Designed to avoid needing a database: check `account.CurrentBalance` first (one cheap call) — if zero,
  report clean and skip the Payment scan entirely. Only scan Payments when the balance is nonzero, since
  that's the only case worth the cost. No persisted state between runs; every refresh recomputes from scratch.
- [x] Bucket unswept payments by age (last 30 days / 30 days–12 months / over 12 months) so severity scales
  with staleness, and cross-check the bucket sum against `CurrentBalance` as a built-in consistency check.
- [x] `/api/undeposited-funds` endpoint + dashboard card, replacing the temporary debug endpoint.
- [ ] **Known gap, unaddressed**: only checks `Payment` entities. A `SalesReceipt` can also route through
  Undeposited Funds and isn't covered by this query — if `balanceMatchesUnswept` ever comes back false on
  real data, this is the most likely cause.
- [ ] Not yet validated against a company with an actual nonzero balance / real unswept payments — only
  tested against a clean ($0) account so far. The bucket-scanning path is unverified on real data.

## Module 3 — Unapplied Payments & Credits
Status: built and live on the dashboard, validated against a real company (found a real backlog on both sides).

Customer-side payments/credits not applied to an invoice overstate open AR; vendor-side credits not applied
to a bill, or vendor payments with no linked bill, misstate AP. Originally scoped from the future-modules
AR/AP Health items.

- [x] Customer side: `Payment.UnappliedAmt > 0` plus `CreditMemo.Balance > 0`, combined into one bucketed check.
- [x] Vendor side: `VendorCredit.Balance > 0` plus `BillPayment` with no `LinkedTxn` of `TxnType: Bill`, combined
  into one bucketed check.
- [x] Confirmed via debug endpoint that `UnappliedAmt` and `Balance` exist as return fields but are **not
  queryable** server-side (same QBO quirk as `DepositToAccountRef` in Module 2) — fetch by `TxnDate` window,
  filter client-side.
- [x] Same no-DB pattern as Module 2: bounded window, bucketed by age (30 days / 30 days–12 months / over 12
  months), recomputed from scratch every refresh.
- [x] `/api/unapplied-transactions` endpoint + dashboard card (one merged row for customer, one for vendor).
- [x] Validated against the real company: found $5,473.75 across 3 unapplied customer transactions (30
  days–12 months old) and $6,400.00 across 5 unapplied vendor transactions (over 12 months old) — not yet
  independently confirmed against QBO's own UI, but the result is plausible and non-trivial.

## Validation Report / Score (new, cross-cutting)
A structured validation layer that every module feeds into, designed so a user can glance at the output and quickly assess whether the financial reporting is trustworthy — not just a single vague health score, but not a wall of detail either:
- **Top-level glance state**: an overall status (e.g. Trustworthy / Caution / Do Not Rely On) that a user sees first. This is a deterministic roll-up of the underlying checks, not a separate judgment call — same severity data, different altitude.
- **Severity hierarchy, not a flat list**: the worst issue surfaces first; lower-severity checks collapse/secondary, so "quickly assess" doesn't break down as more modules (and their checks) get added.
- Each check (per module) emits pass/fail/warning + severity + a plain-language statement framed in terms of the actual report line item at risk (e.g. "Cash balance on your Balance Sheet as of [date] may be misstated" rather than "3 unreconciled transactions in Checking before last rec") — speaking the language of the report the user is about to read, not the language of the underlying QBO data.
- Aggregate into a per-company validation report a bookkeeper/accountant can act on — pointing at specific accounts/transactions, not just a rating.
- Expose machine-readable output (API) in addition to the dashboard, so the validation state could eventually gate or annotate downstream reports/analytics — this is what makes Substrix a trust layer rather than a checklist.

## Future Modules — ranked by how directly and how often they'd corrupt a financial report
(Undeposited Funds Hygiene moved to Module 2; AR/AP unapplied payments/credits moved to Module 3, above.)
1. **Voided / Deleted Transaction Monitoring** — QBO allows voiding or deleting a transaction in an already-reported prior period with no obvious trace, silently changing historical reports after the fact. Same risk class as reconciliation integrity (Module 1), but applies to any transaction, not just reconciled ones.
2. **Cross-Report Consistency Checks** — sanity checks like "does the balance sheet balance," "does P&L net income tie to retained earnings movement," "does AR aging total match the AR balance sheet figure." Unlike per-account checks, this catches systemic data corruption that no single check would surface.
3. **Uncategorized / Suspense Transactions** — directly misstates P&L line items; common, often large $ amounts sitting unclassified.
4. **Chart of Accounts Quality** — mis-mapped accounts corrupt every report built on top of them; root-cause level.
5. **Duplicate Transactions** — duplicate vendor bills/expenses or duplicate bank-feed entries directly overstate expenses/liabilities; common and easy to detect.
6. **Journal Entry Quality** — manual JEs bypass normal transaction controls, can introduce unbalanced or erroneous entries straight into reports.
7. **AP/AR Aging** — separate from the unapplied-payments check in Module 3; this would be open-balance aging on invoices/bills themselves, not unapplied credits.
8. **Bank Feed Health** — unmatched/duplicate feed transactions cause missing or double-counted entries.
9. **Closing & Period Discipline** — backdated entries after a period closes silently change reports already issued.
10. **Negative Balance / Sign Anomaly Detection** — a bank or AR balance going negative when it structurally shouldn't is often a symptom of misclassified transactions.
11. **Payroll Liability Health** — real but narrower scope (one account family).
12. **Tax Line Mapping** — affects tax-specific reports, not general financial statements.
13. **Sales Tax Health** — explored 2026-06-19 (see [SUBSTRIX_PROJECT_SUMMARY_1.md](SUBSTRIX_PROJECT_SUMMARY_1.md)).
    Wanted to cross-check Sales Tax Payable account balances against QBO's own computed liability, but
    `TaxSummary`/`TaxLiabilityReport` both hit the same `Permission Denied 5020` wall as Module 1's
    `ReconciliationDetail`/`Summary` reports — not buildable as originally scoped. `Account`, `TaxAgency`,
    `TaxCode`, `TaxRate` entity queries all work fine, so a scoped-down version (flag negative or stale
    Sales Tax Payable balances, without confirming the dollar amount itself) is still possible.
14. **Fixed Assets & Depreciation** — slower-moving, less frequent source of error, narrower balance-sheet impact.
15. **Inventory Health** (if applicable) — only relevant to users carrying inventory; scoped to COGS/balance sheet.

## Pre-launch hardening (before real users)
- [x] Handle expired refresh tokens / invalid grant errors — `QboAuthExpiredError` now thrown when the refresh
  token is dead or QBO returns 401; API routes clear the session and tell the frontend to redirect to
  `/connect` instead of surfacing a raw 500.
- [x] Add CSRF state validation on OAuth callback — `/connect` now generates a random state stored in session,
  validated on `/callback`, replacing the hardcoded `state=sentri`.
- [x] Capture `intuit_tid` from QBO response headers for support/troubleshooting — logged on every failed
  QBO request.
- [x] Add in-app support/contact link — mailto link in the dashboard header.
- [x] Move sessions out of in-memory store — **decided against, for now** (2026-06-19). Render's free tier
  already spins the app down after inactivity, so a persistent session store wouldn't actually deliver
  "stay logged in" on this tier without also paying for an always-on instance. Adding a DB-backed store
  now would reintroduce the same infra complexity (migrations, connection handling, another failure mode)
  already avoided for the integrity check and Undeposited Funds work, to fix what's really a free-tier
  hosting characteristic, not a code defect. **Revisit once on a paid/always-on tier with real users** —
  a paying user getting logged out unpredictably becomes a real complaint at that point.
- Point `substrix.15446.com` DNS to Render (currently using onrender.com URL)
- [x] Renamed from "Sentri" to "Substrix" (2026-06-19) — PYXUS Holdings holds a live USPTO registration for
  "SENTRI" in classes 009/035/042/044, which overlaps directly with this app's SaaS/business-services
  category. Decided against paying for attorney clearance at this pre-revenue stage; instead switched to a
  name with no apparent conflicts (informally checked via web search — no fintech/SaaS/business usage found,
  just an unrelated DJ handle and an unrelated GitHub project). **Not a substitute for formal trademark
  clearance** — revisit with an attorney before Marketplace submission or any heavier investment in the name.

See [SUBSTRIX_PROJECT_SUMMARY_1.md](SUBSTRIX_PROJECT_SUMMARY_1.md) for full project history and detailed session notes.
