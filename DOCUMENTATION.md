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

functions/                     Cloud Functions (Node 20)
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
  ownership-snapshots/         Dated JSON snapshots (YYYY-MM-DD.json)
  update_rates.py              FRED -> rates.json

.github/workflows/update-rates.yml   Daily rate refresh Action
```

---

## 2. Prerequisites

- Node 20 and npm.
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
Functions are in `us-central1`, Node 20, 512MiB, 540s timeout.

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
Pulls live RTDB, computes dashboard-deduplicated counts, writes `scripts/ownership-snapshots/YYYY-MM-DD.json`, and prints deltas vs the prior snapshot. Use `--file dump.json` to count a local `/clients` dump instead of hitting the live DB.

This script also runs from a local scheduled task at 06:14 daily for a morning summary. It self-adds `/opt/homebrew/bin` and `/usr/local/bin` to PATH so non-login scheduled runs can find the firebase CLI, and surfaces a clear error on auth/CLI failure instead of failing silently.

---

## 7. Monitoring and Alerting

- Function logs: `cd functions && npm run logs` (or `firebase functions:log`).
- Breakage signal: an ERROR log line `[ownership][ALERT] ...` plus `/systemHealth/ownership` in RTDB whenever a county returns zero owners across at least 5 routed lookups in a run.
- Recommended alert: a Cloud Logging log-based alert policy on `severity=ERROR` containing `[ownership][ALERT]` routed to email/SMS. Optional instant webhook via `OWNERSHIP_ALERT_WEBHOOK_URL`.
- Health check on counts: compare the daily snapshot deltas. All-zero ownership movement on a normal day can indicate the nightly run did not execute.

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

### Tune run behavior
Edit `functions/src/config.js`: `REQUEST_DELAY_MS`, `REQUEST_TIMEOUT_MS`, `RECHECK_AFTER_DAYS`, `MAX_LOOKUPS_PER_RUN`, `ALERT_MIN_SAMPLE`. Redeploy functions.

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
- Migration path: [FUTURE_MIGRATION_NOTES.md](FUTURE_MIGRATION_NOTES.md)
- Functions readme: [functions/README.md](functions/README.md)
- Top-level readme: [README.md](README.md)
