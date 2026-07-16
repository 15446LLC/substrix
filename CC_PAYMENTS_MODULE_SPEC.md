# Credit Card Payments Module — Design Spec

Status: **designed, not yet built** (2026-07-16). Decision: this becomes a Substrix module
(shared brand/package/login), not a separate app. Origin: Isaac's Google Sheets "Credit Card
Tiller" system (see `Credit Card Tiller.xlsx`, Sums tab), used in production for his own cards
across three entities. The QBO version scopes to one company (realm) per view, fed by QBO
credit card account registers instead of Tiller.

## Job to be done
Never miss a credit card payment; know exactly how much cash must move and by when, per card
and in total.

## Data model

**Stored per card (the ONLY stored data — all dollar amounts are computed live from QBO,
preserving Substrix's "financial data never stored" promise):**
- QBO account ref (the credit card account in the chart of accounts)
- Display name / bank / holder (optional labels)
- Statement closing day-of-month
- Payment due day-of-month
- Credit limit
- Payment method (enum) + its parameter:
  1. `full_balance` — charge card: due = entire statement balance
  2. `min_payment` — revolving: due = ROUND(statement_balance × APR/12 + statement_balance × 1%); requires APR
  3. `fixed` — settlement plan: due = fixed monthly amount; requires amount
  (extensible if other patterns are discovered)

**Computed live from QBO transactions (GeneralLedger per credit card account, same fetch
pattern as the reconciliation module):**
- Current balance (QBO account CurrentBalance)
- Date of last transaction
- Statement windows from TODAY() + closing day (sheet formulas R15/R16/R22/R23):
  - prior closing = most recent closing date at least one cycle back
  - last closing = most recent closing date
  - due dates = next occurrence of due day after each closing
- Charges on a statement = sum of charges in (prev closing, closing]
- Statement balance = account balance as of closing date (derivable from GL running balance)
- Payments made in a window = sum of payments (credits) in (closing, due] for prior;
  (closing, now] for last
- Payments due = per the card's payment method
- Status: Current if payments made ≥ 95% of payments due (tolerance absorbs estimate error)
- Balance of payments due = max(0, due − made); dashboard total = cash needed now

## UI sketch
- New dashboard section/tab: one row per configured credit card account — balance vs limit
  (warn near/over limit), next due date, amount still due, status badge (green Current /
  red Past Due), drill-down to the statement-cycle detail
- Card setup form: pick from the company's credit card accounts (already fetched by the
  reconciliation module), enter the 4-5 metadata fields
- Include in the PDF report as a section once built

## Future/paid-tier hooks (per the freemium plan)
- Due-date reminder emails / red-flag alerts (Pro)
- Payment execution is explicitly OUT of scope (money movement = regulated territory)

## Notes
- Sign conventions: QBO credit card GL amounts differ from Tiller's (charges positive in QBO
  registers); normalize in the fetch layer.
- The interest+1% minimum is an industry-standard approximation, confirmed by Isaac's
  experience; the 95% status tolerance exists because it IS an approximation.
- Near-limit warning thresholds from the sheet's conditional formatting: red when balance ≥
  limit, warn when within ~10% of limit.
