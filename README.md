# IRMAE CRM

Static CRM web app hosted on GitHub Pages with Firebase Authentication and Firebase Realtime Database.

Live app:

`https://obxiv.github.io/IRMAE_CRM/`

GitHub repo:

`https://github.com/OBXIV/IRMAE_CRM`

## Architecture

- `index.html` is the full GitHub Pages app.
- Firebase Google sign-in controls access.
- Firebase Realtime Database stores client records under `/clients/{clientId}`.
- `rates.json` stores the latest national mortgage-rate snapshot used by the dashboard.
- `.github/workflows/update-rates.yml` refreshes `rates.json` daily from Freddie Mac PMMS data via FRED.
- GitHub does not store the client database.

## Access

Only these Google accounts are allowed by the database rules:

- `mechev14@gmail.com`
- `iecheve@gmail.com`

If another user needs access, add their Google email to `firebase-rules.json`, publish the updated rules in Firebase, then commit/push the rules file for documentation.

## Firebase Settings

Firebase project: `iramecrm`

Realtime Database URL:

`https://iramecrm-default-rtdb.firebaseio.com`

Authentication provider:

- Google only

Authorized domains must include:

- `localhost`
- `127.0.0.1`
- `obxiv.github.io`
- Firebase defaults such as `iramecrm.firebaseapp.com` and `iramecrm.web.app`

## Firebase Rules

The rules in `firebase-rules.json` are the source of truth for who can read/write client data.

To update rules:

1. Open Firebase Console.
2. Go to Realtime Database.
3. Open the Rules tab.
4. Paste the contents of `firebase-rules.json`.
5. Click Publish.

## Safe GitHub Files

Commit these files:

- `index.html`
- `README.md`
- `firebase-rules.json`
- `rates.json`
- `scripts/update_rates.py`
- `.github/workflows/update-rates.yml`
- `.nojekyll`
- `.gitignore`

Do not commit client data files:

- `irmae_crm.db`
- `dbbackup_import.json`
- `irmae_firebase_import_*.json`
- Excel files
- Any exported backup JSON

## Client Imports

Use the app button labeled `Import Clients`.

Typical workflow:

1. Convert a spreadsheet/export into CRM JSON locally.
2. Open the live app.
3. Sign in with an allowed Google account.
4. Click `Import Clients`.
5. Select the JSON file.
6. Confirm the client records appear.

Imported data is written to Firebase, not GitHub.

## Market Rates / Refi Watch

The dashboard shows:

- National 30-year fixed mortgage rate
- National 15-year fixed mortgage rate
- Refi Watch count

Rates come from Freddie Mac PMMS via FRED:

- 30-year series: `MORTGAGE30US`
- 15-year series: `MORTGAGE15US`

The GitHub Action checks for updated rates every morning and commits a refreshed `rates.json` when values change. PMMS is a national weekly average, so the app checks daily but the underlying Freddie Mac values typically change weekly.

Refi Watch flags loans where the client rate is at least `0.75%` above the current national 30-year average. It is a triage signal only, not a rate quote or refinance recommendation.

## Export Backup

Use `Export Backup` to download a dated JSON snapshot of the client data currently loaded from Firebase.

This is a safety copy, not the primary database. Firebase is the live database.

## Local Testing

From this folder:

```bash
python3 -m http.server 8060
```

Then open:

`http://localhost:8060`

Google sign-in works locally because `localhost` is an authorized Firebase domain.

## Deploy Updates

Make changes locally, then:

```bash
git status
git add index.html README.md firebase-rules.json rates.json scripts/update_rates.py .github/workflows/update-rates.yml .nojekyll .gitignore
git commit -m "Describe the change"
git push
```

GitHub Pages will redeploy from the `main` branch.
