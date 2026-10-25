# IRMAE CRM Backlog

Open work only. When an item ships, remove it here and add a row to the change log in [HISTORY.md](HISTORY.md), in the same commit as the change.

This repo is public. Keep client names, record IDs, and any client data out of this file and out of commit messages.

Priority: P0 broken in production · P1 needed soon · P2 cleanup / hardening

---

## Open

### P1
- [ ] **Confirm the catch-up finishes.** Run budget raised to 25 minutes on 2026-10-24. Check the due count (270 that day) drops each night and reaches zero; close this once it does.
- [ ] **Work down the Address Review queue.** About 216 records as of 2026-10-24: roughly 189 missing city and zip, 25 needing a mailing address (second home / investment), 2 missing a street. Data entry in Address Review; a few have one-click fills. Also click **Clear old flags** once to retire the 151 leftover review flags.
- [ ] **Build a Today's Work page.** Combine active Refi Watch records, birthdays, loan anniversaries, address reviews, ownership follow-ups, and manually scheduled actions into one prioritized work queue.
- [ ] **Add outreach action tracking.** Give birthday and anniversary outreach the same Contacted, Snooze, Dismiss, and Reset workflow available in Refi Watch.
- [ ] **Add structured client follow-ups.** Store `nextActionAt`, `nextActionType`, `lastContactedAt`, and an outcome alongside the existing dated client notes, and feed due actions into Today's Work.
- [ ] **Build a data-quality queue.** Surface potential duplicates, missing mailing addresses, incomplete birthdays, malformed phone/email values, and non-standard property types for review and correction.

- [ ] **Check mobile on a real iPhone.** Emulator testing done; confirm Safari specifics (notch, collapsing toolbar, form Save bar) on her phone.

### P2
- [ ] **Alert on missing backups.** Add a Cloud Monitoring alert on the existing email channel when no new file lands in `iramecrm-default-rtdb-backups` for 36 hours, so a stopped backup cannot go unnoticed the way the Sep 13 outage did.
- [ ] **Quarterly restore drill.** Download the latest backup, unzip it, and confirm the client count matches the app (steps in DOCUMENTATION.md, Restore from a backup).
- [ ] Normalize non-standard property type values: `Inv` (2 records, treated as investment), plus one `P` and one `R` that look like loan type entered in the wrong field.
- [ ] Optional instant alerts: set `OWNERSHIP_ALERT_WEBHOOK_URL` and add it to the function's secrets.
- [ ] `functions/src/config.js` `ZIP_COUNTY` has duplicate keys (`83702` twice, `83607` three times). Harmless, but clean up.
- [ ] Dedup logic in `scripts/ownership-snapshot.js` is copied from `index.html`. Extract a shared module so the two cannot drift.

### Later
- [ ] Firebase Hosting + Firestore + Vite migration (see FUTURE_MIGRATION_NOTES.md).
- [ ] Counties beyond Ada and Canyon.
- [ ] Access model beyond two hardcoded emails.
