# IRMAE CRM — Build Specification

OBX-IRMAE-CRM-v1

Owner: Mario Echeverria II (OBX Systems)
Status: Production
Last reviewed: 2026-06-20

---

## 1. Purpose

IRMAE CRM is a private, single-page CRM for a mortgage referral pipeline. It tracks client/borrower records, closings, referral sources, loan programs, and live national mortgage rates. A nightly backend verifies who legally owns each client's property against county assessor portals and fills in missing address parts, so the team can trust ownership and contact data without manual lookups.

It is built to stay cheap and low-maintenance: a static front end on GitHub Pages, a managed Firebase backend, and a small set of scheduled jobs. No server to run, no container to patch.

---

## 2. Scope

In scope:
- Authenticated CRM web app for two approved operators.
- Client record CRUD against Firebase Realtime Database.
- Daily national mortgage-rate snapshot on the dashboard.
- Nightly county property-ownership verification (Ada and Canyon counties, Idaho).
- Automatic address enrichment for street-only records.
- Breakage alerting when a county portal changes and a provider stops returning owners.

Out of scope (today):
- Multi-tenant or role-based access beyond two hardcoded emails.
- Counties outside Ada and Canyon.
- Firestore data model (see [FUTURE_MIGRATION_NOTES.md](FUTURE_MIGRATION_NOTES.md)).
- Mobile-native apps.

---

## 3. Architecture

```
GitHub Pages (static)
  index.html            full SPA: auth gate, dashboard, client table/forms
  rates.json            latest national mortgage-rate snapshot
        |
        | Firebase JS SDK (Google sign-in + RTDB reads/writes)
        v
Firebase project: iramecrm
  Authentication        Google provider only, 2 authorized emails
  Realtime Database     /clients/{clientId}, /systemHealth/ownership
  Cloud Functions (Node 20, us-central1)
     nightlyOwnershipCheck   scheduled 03:15 America/Boise
     runOwnershipCheckNow     manual HTTPS trigger, token-protected
        |
        v
  County assessor portals (Ada, Canyon) via cheerio scraping providers

GitHub Actions
  update-rates.yml      daily 12:30 UTC, refreshes rates.json from FRED

Local tooling (operator machine)
  scripts/ownership-snapshot.js     daily ownership counts + deltas
  scripts/update_rates.py           rate refresh (also run by Action)
```

Design principles:
- Static front end, managed backend. No self-hosted servers.
- The client database lives only in Firebase RTDB. GitHub stores code and the rate snapshot, never client data.
- Provider failures fail safe: a failed lookup never overwrites a record's `ownershipStatus`. This is the core invariant of the nightly run.

---

## 4. Tech Stack

| Layer | Technology |
|---|---|
| Front end | Single-file `index.html`, vanilla HTML/CSS/JS, Firebase Web SDK |
| Hosting | GitHub Pages (`https://obxiv.github.io/IRMAE_CRM/`) |
| Auth | Firebase Authentication, Google provider |
| Database | Firebase Realtime Database (`iramecrm-default-rtdb`) |
| Backend | Firebase Cloud Functions v2, Node 20, `us-central1` |
| Scraping | `cheerio` HTML parsing, custom per-county providers |
| Rate data | FRED API (Freddie Mac PMMS series), Python script |
| CI | GitHub Actions (daily rate refresh) |
| Tests | Node built-in test runner (`node --test`) |

---

## 5. Data Model

Records live under `/clients/{clientId}` in RTDB. Fields observed in use:

Identity and contact
- `borrower1first`, `borrower1last` — primary borrower (required for ownership matching)
- `borrower2first`, `borrower2last` — co-borrower (optional)
- `email`, `phone`

Property and address
- `address` — street line (the anchor for ownership lookups)
- `city`, `state`, `zip`, `county` — used for county routing; may be enriched
- `mailingaddress`, `mailingcity`, `mailingstate`, `mailingzip` — owner's mailing address, shown and used only when `proptype` is `2nd`, `IP`, or legacy `Inv`. Mailers use it instead of the property address; the backend never reads it

Pipeline
- `closing` — closing date (indexed)
- `referral` — referral source (indexed)
- `program` — loan program (indexed)
- `rate` — quoted rate
- `notes`

Ownership verification (written by the backend)
- `ownershipStatus` — `verified` | `unverified` | `trust` | `entity` | `nlor`
- `ownershipOwnerName` — matched legal owner name
- `ownershipCheckedAt` — epoch ms of last lookup
- `addressEnrichmentStatus` — `enriched` | `needs_review`
- `addressEnrichmentLastAttemptAt` — epoch ms of last enrichment attempt

Indexed on: `closing`, `borrower1last`, `referral`, `program` (see `firebase-rules.json`).

System health
- `/systemHealth/ownership` — last run summary and breakage state.

### Ownership status meanings
- `verified` — assessor owner name confidently matches the borrower.
- `unverified` — default before a confident result, or no match yet.
- `trust` — title held in a trust.
- `entity` — title held by an LLC or corporation.
- `nlor` — "name listed on record" differs; an owner was found but does not match.

The dashboard deduplicates raw records into "current rows" before counting. The snapshot script reproduces this dedup so morning counts match the UI exactly.

---

## 6. Backend Pipeline (Nightly Ownership Check)

Entry: `functions/index.js` -> `functions/src/runOwnershipCheck.js`.

Per-run loop, for each client:
1. Skip if no `address`.
2. Skip if checked within `RECHECK_AFTER_DAYS` (30) so load spreads and converges.
3. Route the record to a county via city, then zip fallback (`config.js` `CITY_COUNTY` / `ZIP_COUNTY`).
4. Street-only records (street present, no city/zip/county, Idaho only) take a two-signal probe across counties. A winner requires exactly one county whose owner name confidently matches and whose situs parses with the street anchored. Otherwise the record is marked `needs_review`.
5. Routable records call the county provider, match the returned owner name (`matchOwnership.js`), and write `ownershipStatus`, `ownershipOwnerName`, `ownershipCheckedAt`. Missing address parts are enriched from the parcel situs when the parse is street-anchored and confident.
6. A failed or indeterminate lookup records the attempt but never changes `ownershipStatus`.

Guardrails (`config.js`):
- `REQUEST_DELAY_MS` 1800 — throttle between lookups.
- `REQUEST_TIMEOUT_MS` 45000 — per HTTP request.
- `MAX_LOOKUPS_PER_RUN` 400 — runaway cost / block backstop.
- `RECHECK_AFTER_DAYS` 30 — re-check cadence.
- Browser-like `USER_AGENT` to avoid trivial bot 403s.

Run summary fields: `looked_up`, `updated`, `failed`, `skipped_no_address`, `skipped_recent`, `skipped_no_county`, `unsupported_county`, `street_only_probed`, `address_enriched`, `address_needs_review`, `by_status` (per ownership status).

### Providers
Registry: `functions/src/providers/index.js`. Each provider exposes `lookupOwner(client) -> { ownerName, situsRaw } | null` and throws on HTTP error. Implemented: `adaProvider`, `canyonProvider`. Adding a county:
1. Add `<county>Provider.js` with `lookupOwner`.
2. Register it in `PROVIDERS`.
3. Add the slug to `SUPPORTED_COUNTIES` and city/zip entries in `config.js`.
4. Validate with `functions/tools/tryAddress.js` before trusting nightly writes.

### Breakage alerting
If a county returns an owner on zero of at least `ALERT_MIN_SAMPLE` (5) routed lookups in a run, the provider is treated as broken. The run emits `logger.error('[ownership][ALERT] ...')` and writes `/systemHealth/ownership`. Two notification paths:
- Cloud Logging alert policy on `severity=ERROR` containing `[ownership][ALERT]`.
- Optional instant webhook via `OWNERSHIP_ALERT_WEBHOOK_URL` secret.

---

## 7. Rate Pipeline

- `scripts/update_rates.py` pulls Freddie Mac PMMS data via the FRED API and writes `rates.json`.
- `.github/workflows/update-rates.yml` runs daily at 12:30 UTC (and on manual dispatch), commits `rates.json` if changed.
- Requires repo secret `FRED_API_KEY`.
- The dashboard reads `rates.json` directly.

---

## 8. Security and Access

- Auth: Google sign-in only. Two emails are authorized in `firebase-rules.json`: `mechev14@gmail.com`, `iecheve@gmail.com`.
- RTDB rules are the source of truth for read/write. The committed `firebase-rules.json` is documentation; the live rules must be published in the Firebase Console to take effect.
- Adding a user: add their Google email to `firebase-rules.json`, publish in the Console, then commit the file.
- Authorized domains must include `localhost`, `127.0.0.1`, `obxiv.github.io`, and Firebase defaults (`iramecrm.firebaseapp.com`, `iramecrm.web.app`).
- Secrets (never committed): `OWNERSHIP_RUN_TOKEN`, `OWNERSHIP_ALERT_WEBHOOK_URL` (Firebase secrets), `FRED_API_KEY` (GitHub secret).
- The manual function trigger requires `?token=` matching `OWNERSHIP_RUN_TOKEN`, else 403.

---

## 9. Environments and Deploy

| Component | Source | Deploy mechanism |
|---|---|---|
| Front end | `index.html`, `rates.json`, `assets/` | Push to default branch -> GitHub Pages |
| Functions | `functions/` | `firebase deploy --only functions` |
| DB rules | `firebase-rules.json` | Publish in Firebase Console (manual) |
| Rates | `scripts/update_rates.py` | GitHub Action (daily) |

Function npm scripts (`functions/package.json`): `test`, `try`, `serve` (emulator), `deploy`, `logs`.

---

## 10. Acceptance Criteria

- Only the two authorized Google accounts can read or write `/clients`.
- A failed county lookup never changes an existing `ownershipStatus`.
- The nightly run stays under `MAX_LOOKUPS_PER_RUN` and respects the 30-day recheck window.
- A broken county provider triggers an ERROR log and `/systemHealth/ownership` write within one run once `ALERT_MIN_SAMPLE` is reached.
- Dashboard ownership counts match the snapshot script (same dedup basis).
- `rates.json` refreshes daily without manual action when `FRED_API_KEY` is valid.

---

## 11. Known Constraints and Risks

- County portals can change markup at any time; providers are scrapers and will need maintenance. Breakage alerting exists to catch this.
- RTDB has no schema enforcement; field integrity depends on the front end and functions.
- Two-email access model does not scale; growth implies the Firestore migration path.
- Ada/Canyon zip overlap means zip routing is intentionally conservative.

See [FUTURE_MIGRATION_NOTES.md](FUTURE_MIGRATION_NOTES.md) for the path to Firebase Hosting + Firestore + a Vite front end.
