# IRMAE CRM History

How the app got here, from the spreadsheets it replaced to today. The phase summaries tell the story; the change log at the bottom has every shipped change by date.

Keeping it current: every shipped change gets a row in the change log, in the same commit as the change. Open work lives in [BACKLOG.md](BACKLOG.md). This repo is public, so no client names or client data here.

---

## At a glance

| Phase | When | What it delivered |
|---|---|---|
| 0. Spreadsheets and a local database | Before May 27, 2026 | Yearly Excel production reports and a local database file |
| 1. Web app launch | May 27 to 28 | Private web CRM on GitHub Pages and Firebase, first records loaded |
| 2. An everyday CRM | June 4 to 10 | Dashboard, referral partners, spreadsheet import, history loaded, loan history, phone cards |
| 3. Ownership verification and mailers | June 15 to 29 | Nightly county ownership checks, address auto-fill, mailers, monitoring, docs |
| Quiet period and an outage | July to October 19 | No changes; the nightly job stopped on Sep 13 and went unnoticed |
| 4. Mailing addresses, mobile, reliability | October 20 to 22 | Mailing addresses, phone layout, nightly job restored, Node 22, import fixes, 2026 loans loaded, outreach lists (refi, birthday, anniversary) |

---

## Phase 0: Before the web app

Closed loans were tracked in yearly Excel "Production Reports" workbooks, with referral sources kept alongside. A local version of the CRM stored its data in a local database file (`irmae_crm.db`), which was converted to a JSON backup to seed the web app.

This is known from the first web version's README. The local version's files are no longer on disk and it was never in git, so nothing more about it is recoverable.

## Phase 1: Web app launch (May 27 to 28, 2026)

- **May 27:** first 61 client records loaded from the converted backup.
- **May 28:** the app went into git as a single-page web app (`index.html`, about 1,150 lines) on GitHub Pages, backed by Firebase sign-in (Google or email) and the Firebase Realtime Database. Database rules limited access to two approved accounts.
- First feature set: a client table (property type, purchase or refinance, borrowers, address, sales price, loan amount, rate, program, closing, referral partner), add, edit and delete, up to four borrowers, contact info, JSON backup download with a reminder, and JSON import.
- Same day: a national mortgage rate panel on the dashboard.

## Phase 2: An everyday CRM (June 4 to 10)

- **Rates:** switched to the official FRED API (Freddie Mac weekly survey), refreshed daily by a GitHub Action.
- **Workflow:** clients open in a side drawer for viewing and editing; refreshed logo and sign-in; compact dashboard metrics; closing-year filters and pagination; a search clear button; the logo returns to the dashboard.
- **Referral partners:** a partner leaderboard and partner detail view, cleanup that merged spelling variants of the same partner, and metrics for self-sourced loans.
- **Loading the history:** spreadsheet import (Excel and CSV) that recognizes common column names. Past yearly production reports were cleaned up and imported (346 records on June 6, about 257 more over June 8 to 10).
- **Borrower data:** deceased flags, phone and email per borrower, standardized phone numbers, and grouping of name variants for the same borrower.
- **Loan history:** loans for the same client are linked, the dashboard shows one row per client with the current loan, and older loans appear under Loan History. Search accepts several words.
- **Refi Watch:** flags loans whose rate sits 0.75 points or more above the market, and all-in-one (AIO-3YR) loans three or more years past closing.
- **Products:** HELOC and 2nd Mortgage program options.
- **Phones:** the client list switches to cards on small screens.
- **Security:** sign-in lasts only for the browser session.
- **Ownership status:** a status badge and drawer field, set by hand at this stage.
- **Planning:** notes on a future move to Firebase Hosting, Firestore and a Vite front end.

## Phase 3: Ownership verification and mailers (June 15 to 29)

- **Nightly ownership check (June 15):** a Cloud Function runs at 3:15am Mountain time, looks up each property's owner of record on the Ada and Canyon county assessor sites, and classifies it as verified, trust, entity, no longer owner, or unverified. It is throttled, rechecks each record at most every 30 days, and a failed lookup never overwrites a status. A token-protected manual trigger allows test runs.
- **Mailers (June 17):** a quarterly mail merge page that filters by ownership and closing year, skips no-longer-owner records and deceased-only households, and exports CSV or Avery 5160 labels.
- **Address auto-fill (June 17):** fills a missing city, state or zip from the county parcel record when the street matches confidently. Street-only records are checked in both counties; ambiguous matches are flagged for review instead of guessed.
- **Breakage alerting (June 17):** if a county returns no owners across a run, the run logs an alert and records it in the database.
- **Daily snapshot (June 19 to 20):** a morning report of ownership counts and day-over-day changes that match the dashboard, plus a fix so it runs reliably on a schedule.
- **Documentation (June 29):** build spec and operations guide. Also a one-off data cleanup of a misplaced name.

## July to October 19: quiet period and an unnoticed outage

No code changes; daily rate updates kept running.

On **September 13** the Google Cloud free trial behind the project expired without being converted to a paid account. Cloud Functions and the scheduler stopped. The app itself kept working, because sign-in and the database run on Firebase's free tier, so nothing looked wrong. The alerting only covered a run that failed, not a run that never happened, so the stop went unnoticed for five weeks.

## Phase 4: Mailing addresses, mobile, and reliability (October 20 to 22)

- **Audit (Oct 20):** found the stalled nightly job; started the backlog.
- **Mailing addresses (Oct 20):** requested by the app's primary user. Second home and investment properties get a mailing address, which the mailers use instead of the property address. Missing ones are flagged, import columns are recognized, and a one-click suggestion offers the borrower's current home address.
- **Phone layout (Oct 20):** clients on the first screen, filters behind a button, no zoom when tapping a field, larger touch targets, and a pinned Save bar. Referral Partners and Mailers became cards.
- **Manual verification push (Oct 20):** 193 ownership statuses updated by hand in one day.
- **Nightly job restored (Oct 21):** billing upgraded to a paid account; each run now stops cleanly at 7 minutes so a large catch-up never times out.
- **Node 22 (Oct 21):** Cloud Functions moved off Node 20 ahead of its October 30 retirement.
- **Import fixes and 2026 loans (Oct 21):** import accepts more column names, keeps every person from joint name cells, and gives clearer errors. 43 loans closing in 2026 were imported.
- **Refi Watch worklist (Oct 21):** the Refi Watch flag became an actionable list. Each flagged loan can be marked contacted (which auto-schedules a follow-up in 90 days), snoozed, or dismissed, and the dashboard count now reflects what still needs working rather than the raw flag total.
- **Birthday outreach (Oct 21):** a month-by-month list of client birthdays for relationship calls, with the age they turn and contact info, reusing the mailers table and CSV export. Loan anniversaries can join the same view later.
- **Loan-anniversary outreach (Oct 22):** the Birthday Outreach page became a unified Outreach page with a Birthdays / Loan Anniversaries toggle. Anniversary mode surfaces clients whose closing anniversary lands in the selected month, with years since closing, reusing the same table and CSV export.
- **Per-client notes (Oct 22):** a dated contact log on the client drawer. Notes stamp date, time, and author, can be deleted, and are stored with push keys so two users adding at once do not overwrite each other.
- **Stale-heartbeat check (Oct 22):** the daily snapshot flags the nightly ownership job when its heartbeat is older than 36 hours, so a stalled job is caught instead of going unnoticed like the five-week outage.
- **Cloud alerting (Oct 22):** found that no Cloud Monitoring alert policy or notification channel had ever existed, so breakage alerts could never reach anyone. Added an email channel and two policies, one for a broken county scraper and one for the nightly job not running at all, closing the gap behind the five-week outage.

---

## Data over time

| Date | Records | Clients on dashboard | Verified owners |
|---|---|---|---|
| May 27 | 61 | | |
| June 10 | 664 | | |
| June 19 | 664 | 545 | 131 |
| October 21 | 707 | 570 | 370 |

Loans by closing year (October 21): 2018: 71 · 2019: 142 · 2020: 133 · 2021: 123 · 2022: 54 · 2023: 33 · 2024: 42 · 2025: 58 · 2026: 43 · no date: 8.

---

## Change log

Newest first. Commit hashes are in git; this table is the readable version.

| Date | Change |
|---|---|
| 2026-10-24 | Nightly ownership run allowed 25 minutes instead of 7 (function timeout raised to the 30 minute maximum; Cloud Scheduler deadline follows). County lookups had slowed to about 16 seconds each, so only 26 fit in a run and the 270-record post-outage catch-up was crawling. Same 1.8 second pause between lookups, still inside the free tier |
| 2026-10-24 | Daily database backups: Firebase-managed backups of all data and the security rules to the Cloud Storage bucket iramecrm-default-rtdb-backups, gzipped, kept indefinitely (30-day auto-delete deliberately off). First backup run by hand and completed (65 KB). Restore steps documented in DOCUMENTATION.md |
| 2026-10-23 | Nightly ownership check stops retrying no-owner and no-match results every night; it waits 14 days instead. Those retries were growing by about a third of each night's lookups and would have used up the 7 minute budget, stalling the post-outage catch-up. Site errors still retry nightly |
| 2026-10-22 | Cloud alerting stood up. Confirmed no Monitoring alert policy or notification channel existed (so breakage alerts never reached anyone). Created an email channel to mario@obliox.io and two enabled policies: provider breakage (log match on [ownership][ALERT]) and nightly-run-missing (no [ownership] run complete logged in 24h). DOCUMENTATION section 7 now documents the real setup |
| 2026-10-22 | Stale-heartbeat check: the daily ownership snapshot reads /systemHealth/ownership.at on a live pull and exits non-zero with a loud warning when the nightly job's last run is older than 36h or missing. Closes the gap that hid the Sep 13 to Oct 19 outage, where only a failed run alerted, never a run that never happened |
| 2026-10-22 | Per-client notes: a dated contact log on the client drawer. Each note stamps date, time, and author and can be deleted; stored under the client with Firebase push keys so concurrent edits do not clobber, and note text is escaped on display |
| 2026-10-22 | Outreach gained a loan-anniversary mode: the Birthday Outreach page became a unified Outreach page with a Birthdays / Loan Anniversaries toggle. Anniversary mode lists clients whose loan closing anniversary falls in the selected month, with years since closing and contact info, skipping no-longer-owner and deceased-only households |
| 2026-10-21 | Birthday Outreach page: clients with birthdays in a selected month (defaults to the current month), showing the age they turn, phone and email, and property with ownership. Dedupes repeat clients, skips deceased borrowers, covers both borrowers, and exports CSV. Reached from the menu and a Birthdays button next to Mailers |
| 2026-10-21 | Refi Watch became a worklist: per-loan Contacted / Snooze (30 or 90 day) / Dismiss / Reset state, the dashboard card shows the active count that drops as the list is worked, a scope bar switches between to-work / snoozed / dismissed / all-flagged, and each flagged record shows its rate-vs-market delta. A failed write never changes the saved state |
| 2026-10-21 | Spreadsheet import accepts "Borrower First Name" / "Borrower Last Name" style headers, keeps every person from joint name cells ("A & B" + "Smith", or "A" + "Smith & B Jones"), and shows a specific error when the header row or name columns are missing. 43 loans closing in 2026 imported |
| 2026-10-21 | Cloud Functions moved to Node 22 (firebase-functions 7.4, firebase-admin 14.5) ahead of the Oct 30 Node 20 cutoff; forced run on the new runtime succeeded |
| 2026-10-21 | Nightly ownership job restored. Cause: Google Cloud free trial expired 2026-09-13 with no paid upgrade. Billing upgraded; run stops cleanly at a 7 minute budget; forced run succeeded |
| 2026-10-20 | Ownership snapshots are rolling local files: script keeps the last 3, folder not in git |
| 2026-10-20 | Mobile pass 2: Referral Partners and Mailers become cards on phones, summary boxes three across |
| 2026-10-20 | Mobile pass 1: clients on the first phone screen (compact stats and rates, collapsible filters), no zoom-on-tap, 44px touch targets, tighter header, pinned form Save bar |
| 2026-10-20 | One-click mailing address suggestion from the borrower's current owner-occupied loan (skips homes no longer owned); review-list rows open the exact record |
| 2026-10-20 | Mailing address for second home and investment properties: form, drawer, import columns, mailers use it, flagged when missing |
| 2026-10-20 | Backlog started; pending June work pushed |
| 2026-10-20 | Status audit: nightly job stalled since 09-13; Ada and Canyon scrapers confirmed working |
| 2026-09-13 | Outage begins: Google Cloud free trial expires, nightly job and scheduler stop |
| 2026-06-29 | Build spec (BUILD_SPEC.md) and operations guide (DOCUMENTATION.md) |
| 2026-06-29 | Data fix in the live database: removed a referral partner's name wrongly embedded in a client name field |
| 2026-06-20 | Snapshot script finds the firebase CLI in scheduled runs and fails loudly instead of silently |
| 2026-06-19 | Daily ownership snapshot tool with dashboard-matched counts |
| 2026-06-17 | Breakage detection and alerting in the nightly run |
| 2026-06-17 | Address auto-fill from county assessors |
| 2026-06-17 | Ownership status filtering and mailers page (CSV and Avery labels) |
| 2026-06-16 | Borrower name variants grouped as one borrower |
| 2026-06-15 | Nightly ownership verification Cloud Functions (Ada and Canyon counties) |
| 2026-06-10 | Ownership status badges and drawer field |
| 2026-06-10 | Referral partner spelling variants merged |
| 2026-06-10 | Multi-word client search |
| 2026-06-10 | Dashboard shows one row per client with the current loan; related loan history in the drawer; view caching |
| 2026-06-10 | Phone and email per borrower; phone numbers standardized |
| 2026-06-10 | Sign-in lasts for the browser session only |
| 2026-06-09 | Refi Watch (rate spread and AIO-3YR age); local sign-in improvements |
| 2026-06-08 | Search clear button; logo returns to the dashboard |
| 2026-06-08 | HELOC and 2nd Mortgage program options |
| 2026-06-08 | Phone card view for the client list |
| 2026-06-07 | Future migration notes |
| 2026-06-06 | Deceased borrower flags; self-sourced referral metrics |
| 2026-06-06 | Spreadsheet import recognizes a loan product column; referral partner names cleaned up |
| 2026-06-06 | Referral partner workflow improvements |
| 2026-06-06 | Closing-year filters and pagination |
| 2026-06-06 | Spreadsheet client import (Excel and CSV); past production reports loaded |
| 2026-06-05 | Compact dashboard metric cards |
| 2026-06-05 | Referral partner insights |
| 2026-06-05 | Logo and sign-in styling |
| 2026-06-05 | Side drawer workflow for viewing and editing clients |
| 2026-06-04 | Mortgage rates from the official FRED API, refreshed daily |
| 2026-05-28 | National mortgage rate panel |
| 2026-05-28 | GitHub Pages and Firebase setup documented |
| 2026-05-28 | Web app first committed: Firebase sign-in, Realtime Database, client CRUD, JSON backup and import |
| 2026-05-27 | First 61 client records loaded from the local database backup |
