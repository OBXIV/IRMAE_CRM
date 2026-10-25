# IRMAE CRM — Operations and Developer Guide

Companion to [BUILD_SPEC.md](BUILD_SPEC.md). This is the hands-on guide: how to run it, deploy it, monitor it, and fix it when a county portal breaks.

Firebase project: `iramecrm` · RTDB: `https://iramecrm-default-rtdb.firebaseio.com` · Live app: `https://obxiv.github.io/IRMAE_CRM/`

---

## 1. Repository Layout

```
index.html                     Full single-page app (auth, dashboard, client table/forms)
rates.json                     Latest national mortgage-rate snapshot
firebase-rules.json            RTDB security rules (source of truth, publish manually)
firebase.json / .firebaserc    Firebase project + deploy config
assets/                        Logo and static images

functions/                     Cloud Functions (Node 22)
  index.js                     Entry: nightlyOwnershipCheck + runOwnershipCheckNow
  src/
    runOwnershipCheck.js       Core nightly loop
    config.js                  Throttles, caps, county routing tables
    countyRouter.js            City/zip -> county routing
    providers/                 Per-county scrapers (ada, canyon) + http helper
    matchOwnership.js          Owner-name -> status classification
    enrichAddress.js           Situs parsing + street-only resolution
    addressUtils.js            Address parsing helpers
    nameUtils.js               Name normalization
    healthAlert.js             Breakage detection + webhook
  test/                        node --test suites
  tools/tryAddress.js          Manual provider probe for one address

scripts/
  ownership-snapshot.js        Daily dedup ownership counts + deltas
  ownership-snapshots/         Dated JSON snapshots (YYYY-MM-DD.json), last 3 kept, gitignored
  update_rates.py              FRED -> rates.json

.github/workflows/update-rates.yml   Daily rate refresh Action
```

---

## 2. Prerequisites

- Node 22 or newer and npm.
- Firebase CLI, logged in: `firebase login` (current account: `mechev14@gmail.com`).
- Python 3.x for the rate script.
- Access to the `iramecrm` Firebase project.

Verify CLI auth:
```
firebase login:list
```

---

## 3. Local Development

Front end (static, no build step):
```
# from repo root
python3 -m http.server 8000
# open http://127.0.0.1:8000/index.html
```
`127.0.0.1` and `localhost` are already authorized domains for Google sign-in.

Cloud Functions:
```
cd functions
npm install
npm run serve          # firebase emulators:start --only functions
npm test               # node --test
npm run try -- "123 Main St, Boise, ID 83702"   # probe a provider directly
```

---

## 4. Deploy

### Front end
Push to the default branch. GitHub Pages publishes `index.html` and `rates.json`. No build.

### Cloud Functions
```
cd functions
firebase deploy --only functions
```
Functions are in `us-central1`, Node 22, 512MiB, 1800s timeout (the maximum for scheduled functions; deploy also sets the Cloud Scheduler attempt deadline to 1800s).

### Database rules
`firebase-rules.json` is documentation. To make rules live:
1. Firebase Console -> Realtime Database -> Rules.
2. Paste the contents of `firebase-rules.json`.
3. Publish.
Then commit any change for the record.

---

## 5. Secrets

| Secret | Where | Purpose |
|---|---|---|
| `OWNERSHIP_RUN_TOKEN` | Firebase functions secret | Guards the manual HTTPS trigger |
| `OWNERSHIP_ALERT_WEBHOOK_URL` | Firebase functions secret (optional) | Instant breakage webhook (Slack/Zapier) |
| `FRED_API_KEY` | GitHub repo secret | FRED API access for rate refresh |

Set a Firebase secret:
```
firebase functions:secrets:set OWNERSHIP_RUN_TOKEN
```
Adding the webhook also requires adding it to the `secrets` array in `functions/index.js` and redeploying.

---

## 6. Scheduled and Manual Jobs

### Nightly ownership check
- Trigger: Cloud Scheduler, `03:15 America/Boise`, daily.
- Function: `nightlyOwnershipCheck`.
- Writes ownership/enrichment fields per client and `/systemHealth/ownership`.

### Manual ownership run (testing)
```
curl "https://us-central1-iramecrm.cloudfunctions.net/runOwnershipCheckNow?token=$OWNERSHIP_RUN_TOKEN"
```
Returns the run summary JSON. A wrong/absent token returns 403.

### Daily rate refresh
- GitHub Action `update-rates.yml`, `12:30 UTC` daily and on manual dispatch.
- Commits `rates.json` only when values change.

### Daily ownership snapshot (operator machine)
```
cd "<repo>" && node scripts/ownership-snapshot.js
```
Pulls live RTDB, computes dashboard-deduplicated counts, writes `scripts/ownership-snapshots/YYYY-MM-DD.json`, and prints deltas vs the prior snapshot. Only the 3 most recent snapshots are kept; they live on the operator machine and are not committed. Use `--file dump.json` to count a local `/clients` dump instead of hitting the live DB.

This script also runs from a local scheduled task at 06:14 daily for a morning summary. It self-adds `/opt/homebrew/bin` and `/usr/local/bin` to PATH so non-login scheduled runs can find the firebase CLI, and surfaces a clear error on auth/CLI failure instead of failing silently.

### Daily database backups
- Firebase-managed automatic backups of the Realtime Database: all data plus the security rules, once a day, as gzipped JSON.
- Stored in the Cloud Storage bucket `iramecrm-default-rtdb-backups` (project `iramecrm`). Each backup is two files: `<UTC time>_iramecrm-default-rtdb_data.json.gz` and `<UTC time>_iramecrm-default-rtdb_rules.json.gz`.
- Kept indefinitely. The 30-day auto-delete option is off on purpose: the Sep 2026 outage went unnoticed for five weeks, and 30 days of history could be too short to recover from a slow problem. Storage is about 65 KB a day.
- Firebase chooses the daily backup time; the console has no time setting.
- Manage in Firebase console > Realtime Database > Backups: history, settings (gear), and **Start manual backup**.
- Requires the Blaze (paid) plan. If billing lapses, backups stop along with Cloud Functions.
- The app's **Export Clients** JSON download is still available as a second, manual backup.

---

## 7. Monitoring and Alerting

- Function logs: `cd functions && npm run logs` (or `firebase functions:log`).
- The nightly job emits two signals every run:
  - `[ownership][ALERT] ...` (ERROR) plus `/systemHealth/ownership` in RTDB when a county returns zero owners across at least 5 routed lookups (a scraper broke).
  - `[ownership] run complete ...` (INFO) on every successful run — the success heartbeat.

### Configured alerts (project `iramecrm`, Cloud Monitoring)

Email notification channel **IRMAE ownership alerts** → `mario@obliox.io`. Two enabled policies:

1. **IRMAE ownership provider breakage** — log-based alert, filter `severity>=ERROR AND "[ownership][ALERT]"`. Catches a county scraper breaking during a run.
2. **IRMAE ownership nightly run missing** — metric-threshold alert on the log metric `ownership_run_complete` (counts `[ownership] run complete` on the `nightlyownershipcheck` service). Fires when no successful run is logged in 24h, i.e. the job stopped running. This is the outage class that went unnoticed for five weeks in 2026. A metric-absence condition cannot cover a 24h-cadence job (its window maxes at 23h30m), so this uses a 24h rolling `ALIGN_SUM < 1` with missing data treated as breaching.

Inspect or re-create:

```bash
gcloud alpha monitoring policies list --project=iramecrm --format="csv(displayName,enabled)"
gcloud alpha monitoring channels list --project=iramecrm --format="csv(displayName,labels.email_address,enabled)"
gcloud logging metrics describe ownership_run_complete --project=iramecrm
```

Backstops independent of Cloud Monitoring:

- The daily snapshot (`scripts/ownership-snapshot.js`) checks `/systemHealth/ownership.at` and exits non-zero when it is older than 36h.
- Optional instant breakage webhook via `OWNERSHIP_ALERT_WEBHOOK_URL` (see Secrets).
- Count sanity: all-zero ownership movement in the daily snapshot delta on a normal day can mean the nightly run did not execute.

---

## 8. Common Tasks

### Add an authorized user
1. Add the Google email to both `.read` and `.write` in `firebase-rules.json`.
2. Publish rules in the Console.
3. Commit the file.

### Add a new county
1. Create `functions/src/providers/<county>Provider.js` exposing `lookupOwner(client) -> { ownerName, situsRaw } | null` (throw on HTTP error).
2. Register it in `functions/src/providers/index.js`.
3. Add the slug to `SUPPORTED_COUNTIES` and add `CITY_COUNTY` / `ZIP_COUNTY` entries in `config.js`.
4. Validate with `npm run try -- "<address>"`.
5. Add a test in `functions/test/`, run `npm test`, then deploy.

### Add a What's new entry (every user-facing release)
The app shows a red dot on the ☰ menu until the user opens **What's new**. The notes live in `RELEASE_NOTES` in `index.html`. For any change a user would notice, add an entry at the top of that array in the same commit as the change:
```
{ id: '2026-11-02-short-slug', date: '2026-11-02', title: 'Short name', items: ['One plain-English sentence per change.'] }
```
The `id` must be new; a new top id is what turns the dot on. Write for the person using the CRM, not for developers (no field names or code terms). Behind-the-scenes work only needs an entry when it changes something she can see or rely on. Seen state is stored per browser, so each device shows the dot once per release.

### Work the address review queue
Open **Address Review** from the menu, or click **Needs Address Review** on the Mailers page. Records are grouped by problem (missing city and zip, needs mailing address, missing street) and shown one at a time: type the fix and press **Save & next** (or Enter), take a one-click suggestion when one exists, **Skip**, or **Can't fix** with an optional reason (listed under Can't fix, where **Put back** returns it to the queue). A record leaves the queue as soon as its address is complete. The county probe's old `needs_review` flag no longer counts once an address is complete; saving clears it, and the page offers a one-time **Clear old flags** button for leftovers.

### Restore from a backup
A restore overwrites live data, so work from a fresh safety copy:
1. Firebase console > Realtime Database > Backups > **Start manual backup**, so the current state can be recovered if the restore goes wrong.
2. Open the bucket link on the Backups tab, download the `..._data.json.gz` file from the date you need, and unzip it (`gunzip <file>`).
3. Pick the scope:
   - **Whole database:** Data tab > three-dot menu at the root > **Import JSON** and choose the unzipped file. This replaces everything.
   - **All clients only:** extract the `clients` object from the file, then `firebase database:set /clients clients.json --project iramecrm`. This replaces every client but leaves `/systemHealth` alone.
   - **One client:** copy that record from the file into `client.json`, then `firebase database:set /clients/<clientId> client.json --project iramecrm`.
4. Rules are restored separately, only if they changed: paste the unzipped `..._rules.json` into the Rules tab and publish.
5. Reload the CRM and spot-check counts against the daily ownership snapshot.

### Tune run behavior
Edit `functions/src/config.js`: `REQUEST_DELAY_MS`, `REQUEST_TIMEOUT_MS`, `RECHECK_AFTER_DAYS`, `RETRY_UNRESOLVED_AFTER_DAYS`, `MAX_LOOKUPS_PER_RUN`, `RUN_TIME_BUDGET_MS`, `ALERT_MIN_SAMPLE`. Redeploy functions.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `firebase: command not found` in a scheduled/snapshot run | non-login shell PATH missing the CLI dir | The snapshot script now self-adds homebrew/usr-local bin; for other scripts export PATH or use the absolute binary |
| Snapshot run produced no dated file | firebase pull threw (auth or PATH) before write | Run `firebase login:list`; re-run the script; check the printed error |
| Manual trigger returns 403 | wrong/missing `OWNERSHIP_RUN_TOKEN` | Pass the correct token query param |
| One county shows `[ownership][ALERT]` | portal markup changed, provider broke | Probe with `npm run try`, update the provider's cheerio selectors, test, deploy |
| All ownership deltas zero on a normal day | nightly run did not execute | Check function logs and Cloud Scheduler |
| Sign-in blocked | domain not authorized or email not in rules | Add domain in Auth settings / email in rules |
| No new backup on the Backups tab for over a day | billing lapsed (backups need Blaze) or the backup bucket was removed | Check billing; on the Backups tab confirm Daily is enabled and the bucket exists, then **Start manual backup** |
| Records not enriching | no street, or city/zip present but unsupported county | Expected; only street-only Idaho records take the two-signal probe |

---

## 10. Invariants (do not break)

- A failed or indeterminate county lookup must never overwrite an existing `ownershipStatus`.
- The snapshot dedup logic in `scripts/ownership-snapshot.js` is copied verbatim from `index.html`; if the dashboard grouping changes, update both together or counts will diverge.
- GitHub never stores client data. Only code and the rate snapshot are committed.
- Rules in the Console are authoritative; the committed file is documentation and must be published to take effect.

---

## 11. Reference

- Build spec: [BUILD_SPEC.md](BUILD_SPEC.md)
- Backlog (open work): [BACKLOG.md](BACKLOG.md)
- History and change log: [HISTORY.md](HISTORY.md)
- Migration path: [FUTURE_MIGRATION_NOTES.md](FUTURE_MIGRATION_NOTES.md)
- Functions readme: [functions/README.md](functions/README.md)
- Top-level readme: [README.md](README.md)
