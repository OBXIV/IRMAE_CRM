# IRMAE CRM - GitHub Pages + Firebase

This folder is the static web app version for GitHub Pages.

## What Gets Uploaded To GitHub

Upload only this folder's static app files:

- `index.html`
- `.nojekyll`
- `firebase-rules.json` as a reference file

Do not upload:

- `irmae_crm.db`
- `dbbackup_import.json`
- Excel files
- Any backup JSON with client data

## Firebase Setup

1. Create a Firebase project.
2. Add a Web app.
3. Enable Authentication.
4. Enable either Google sign-in, Email/Password, or both.
5. Create a Realtime Database.
6. In Realtime Database Rules, copy `firebase-rules.json`.
7. Replace `wife@example.com` and `you@example.com` with the allowed login email addresses.
8. Copy the Firebase web app config into the `FIREBASE_CONFIG` block in `index.html`.

## First Data Import

After signing into the hosted CRM:

1. Click `Import Backup`.
2. Select the converted backup JSON file, for example `dbbackup_import.json`.
3. Confirm the rows load.
4. Do not commit that JSON file to GitHub.

## Backup

The `Backup` button downloads a dated JSON backup from Firebase data currently loaded in the browser.
