# Sentri — Project Summary

## What Is Sentri?

Sentri is a web application that connects to QuickBooks Online (QBO) via the Intuit API and provides a **books health dashboard** — starting with reconciliation health as Module 1, with additional inspection modules to follow.

The name is a deliberate misspelling of "Sentry" — something standing watch over your books, catching problems before they become serious. It is short, ownable, and feels like infrastructure software.

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
2. ✅ Create Sentri app in developer dashboard
3. ✅ Retrieve development OAuth credentials (Client ID + Client Secret)
4. ✅ Configure Redirect URI: `http://localhost:3000/callback`
5. ⬜ Set up Node.js project locally
6. ⬜ Build OAuth 2.0 authentication flow
7. ⬜ Connect to QBO sandbox (test data)
8. ⬜ Build account-fetching logic
9. ⬜ Build reconciliation data logic
10. ⬜ Build unreconciled transaction logic + health scoring
11. ⬜ Build frontend dashboard
12. ⬜ Deploy to live URL
13. ⬜ Submit to Intuit App Marketplace

---

## Intuit Developer Portal

- **Portal:** developer.intuit.com
- **Workspace:** 15446
- **App Name:** Sentri
- **App ID:** 0c2db838-0028-49e3-b48e-45a3af7e0004
- **Status:** In Development
- **Redirect URI (Development):** `http://localhost:3000/callback`
- **Credentials:** Stored securely (do not commit to GitHub)

---

## Name Research (May 12, 2026)

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

**Decision:** Proceed under the Sentri name through development. Reassess trademark situation with a trademark attorney before launch. PYXUS Holdings registration is the key item to review.

---

## Notes

- The reconciliation integrity check (detecting whether a reconciliation has been broken after the fact) is the most technically complex feature and may move to v2.
- Claude Code (in the Claude app) is the primary development environment.
- Credentials (Client ID and Client Secret) are **never** to be committed to GitHub or shared.
