# IRMAE CRM — Ownership Verification Function

Nightly Cloud Function that checks whether each client still owns their property
and writes an `ownershipStatus` back to the client record in Firebase RTDB.

## What it does

1. Reads every record under `/clients`.
2. Routes each to the right county portal (Ada or Canyon) by city/zip.
3. Scrapes the assessor portal by street address to read the current owner name.
4. Classifies the owner vs. `borrower1first` + `borrower1last`:
   - name contains trust/revocable/living trust → `trust`
   - name contains LLC/Inc/Corp/Holdings → `entity`
   - name fuzzy-matches the borrower → `verified`
   - a different real person → `nlor` (No Longer Owner of Record)
5. Writes `ownershipStatus` + `ownershipCheckedAt` **only on a confident result.**
   Any failure, timeout, or ambiguous read leaves the existing status untouched.
6. Flags addresses outside supported counties for later expansion without
   inventing a sixth frontend pill.

The five frontend pill values are `unverified | verified | trust | entity | nlor`.

## Status fields written to each client

| field | when | meaning |
|---|---|---|
| `ownershipStatus` | confident result only | the pill value |
| `ownershipCheckedAt` | confident result only | epoch ms of the successful check |
| `ownershipOwnerName` | confident result only | raw owner name read from the portal |
| `ownershipSource` | confident result only | `ada` or `canyon` |
| `ownershipLastAttemptAt` | every attempt | epoch ms of the last attempt |
| `ownershipLastError` | on failure/ambiguous | reason (`no_owner_found`, `no_confident_match`, HTTP error) |
| `ownershipCheckStatus` | every attempted supported lookup, plus unsupported counties | `checked`, `lookup_failed`, `no_owner_found`, `no_confident_match`, or `unsupported_county` |
| `ownershipSupportedCounty` | attempted supported lookup, plus unsupported counties | `true` for Ada/Canyon attempts, `false` when the address cannot route to a supported county |

`ownershipStatus` is never overwritten on failure. That invariant is the whole point.
If a non-Ada/Canyon record has no `ownershipStatus`, the function sets it to
`unverified` and writes `ownershipCheckStatus: "unsupported_county"` plus
`ownershipSupportedCounty: false`. Existing good statuses like `verified`,
`trust`, `entity`, and `nlor` are left intact.

## Prerequisite: Blaze plan

> The `iramecrm` project is on **Spark** today. Cloud Functions cannot make
> outbound network calls (the scrapers) on Spark. **Nothing runs until the
> project is upgraded to Blaze (pay-as-you-go)**, same as Job-Tracker.

Firebase Console → ⚙ → Usage and billing → Modify plan → Blaze.

## Deploy

```bash
# from repo root
npm install -g firebase-tools        # if needed
firebase login
cd functions && npm install && cd ..
firebase deploy --only functions
```

Scheduled function: `nightlyOwnershipCheck` runs 3:15am America/Boise.

## Manual run (for testing the deployed function)

Set a shared secret, then hit the HTTP trigger:

```bash
firebase functions:secrets:set OWNERSHIP_RUN_TOKEN     # paste a random string
firebase deploy --only functions:runOwnershipCheckNow
curl "https://us-central1-iramecrm.cloudfunctions.net/runOwnershipCheckNow?token=YOUR_TOKEN"
```

Returns a JSON summary (scanned / looked_up / updated / failed / by_status).

## Tuning the scrapers (the fragile part)

The matching logic is solid and unit-tested (`npm test`). The **scrapers are
best-effort** and target the live portals as documented, but the exact request
shapes and HTML selectors change when the counties touch their sites, and a
cloud-server IP may be rate-limited or blocked. Validate against one real
address before trusting a full run:

```bash
cd functions
node tools/tryAddress.js ada    "1234 W State St" --first John --last Smith
node tools/tryAddress.js canyon "987 Main St"     --first Jane --last Doe
```

It prints the owner name the scraper read and how it would classify. If
`owner read: null`, open the portal in a browser, find the owner field in
DevTools → Network/Elements, and adjust:

- **Ada** — `src/providers/adaProvider.js`: `SEARCH_URL`, the query params in
  `lookupOwner`, and `OWNER_SELECTORS`.
- **Canyon** — `src/providers/canyonProvider.js`: the WebForms control names
  (`FIELD_ADDRESS`, `BTN_SEARCH`) and `extractOwner` selectors. The Canyon
  ArcGIS web map (`maps.canyonco.org`) also exposes owner in parcel popups; if
  its FeatureServer is reachable it is far more robust than the ASP.NET scrape
  and can replace `lookupOwner` behind the same interface.

If the portals prove unworkable from a cloud IP, swap in **ATTOM Data API**: add
`src/providers/attomProvider.js` exposing the same `lookupOwner(client)` shape
and register it in `src/providers/index.js`. Nothing else changes — the
orchestrator, matching, and write-back stay as-is.

### Current live validation notes

- Canyon: validated with `5337 Joe Lane, Nampa`; the QuickSearch API returns
  owner `ACACIA LIVING TRUST`, classified as `trust`.
- Ada: `4600 W Gillette St, Meridian` resolves to parcel `R1317510110`, but
  Ada's current detail page renders the `Primary Owner` value blank for
  automated requests. The provider therefore returns `null`, and the run loop
  leaves existing ownership status unchanged. Use ATTOM or a county-approved
  data source if Ada owner automation must be reliable.

## Adding another county later

The county system is intentionally scaffolded so more counties can be added
without changing the matcher or write-back rules.

1. Add `src/providers/<county>Provider.js`.
2. Export `lookupOwner(client) -> Promise<{ ownerName } | null>` and
   `county: '<county>'`.
3. Register the provider in `src/providers/index.js`.
4. Add the county slug to `SUPPORTED_COUNTIES` in `src/config.js`.
5. Add city and zip routing entries to `CITY_COUNTY` and `ZIP_COUNTY`.
6. Validate at least one real address with:

```bash
cd functions
node tools/tryAddress.js <county> "123 Main St" --first Jane --last Doe
```

7. Add route and run-loop tests before trusting nightly writes.

Until a county has all of those pieces, records outside Ada/Canyon are marked
with `ownershipCheckStatus: "unsupported_county"` and remain manually reviewable.

## Knobs (`src/config.js`)

- `REQUEST_DELAY_MS` — pause between lookups (politeness / block avoidance)
- `RECHECK_AFTER_DAYS` — skip records checked within this window
- `MAX_LOOKUPS_PER_RUN` — hard cap per run
- `SUPPORTED_COUNTIES` — county slugs with implemented providers
- `CITY_COUNTY` / `ZIP_COUNTY` — county routing tables

## Tests

```bash
cd functions && npm test
```
