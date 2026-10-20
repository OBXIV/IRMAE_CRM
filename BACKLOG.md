# IRMAE CRM Backlog

Open work at the top, shipped work at the bottom. Update this file in the same commit as the change it describes.

This repo is public. Keep client names, record IDs, and any client data out of this file and out of commit messages.

Priority: P0 broken in production · P1 needed soon · P2 cleanup / hardening

---

## Open

### P0
- [ ] **Nightly ownership job not running since 2026-09-13.** No record has a check attempt after that date and `/systemHealth/ownership` still holds the Sep 13 entry, so no run has completed since. Check the Cloud Scheduler job for `nightlyOwnershipCheck` and Blaze plan billing in the GCP console, then trigger `runOwnershipCheckNow` and confirm the heartbeat timestamp updates. Scrapers are not the cause: Ada and Canyon both returned owners on 2026-10-20.
- [ ] **Stale-heartbeat check.** Have `scripts/ownership-snapshot.js` read `/systemHealth/ownership.at` and flag it when older than 36h. Today alerts only fire on a failed run, so a job that never runs goes unnoticed (it did, for 5 weeks).

### P1
- [ ] **Work down address needs-review queue.** 252 records flagged `needs_review`, flat since at least 2026-10-15. Consider a review-queue view in the app so they can be cleared in one pass.
- [ ] **Confirm the log-based alert policy exists** for `[ownership][ALERT]` (DOCUMENTATION.md section 7). The Sep 13 alert does not appear to have reached anyone.

- [ ] **Fill mailing addresses on non-primary records.** 48 second home / investment records show "Needs mailing address". 9 have a one-click suggestion (Mailers > address review, or the drawer); the other 39 need the address entered by hand.

- [ ] **Check mobile on a real iPhone.** Emulator testing done; confirm Safari specifics (notch, collapsing toolbar, form Save bar) on her phone.

### P2
- [ ] Normalize non-standard property type values: `Inv` (2 records, treated as investment), plus one `P` and one `R` that look like loan type entered in the wrong field.
- [ ] Optional instant alerts: set `OWNERSHIP_ALERT_WEBHOOK_URL` and add it to the function's secrets.
- [ ] `functions/src/config.js` `ZIP_COUNTY` has duplicate keys (`83702` twice, `83607` three times). Harmless, but clean up.
- [ ] Dedup logic in `scripts/ownership-snapshot.js` is copied from `index.html`. Extract a shared module so the two cannot drift.

### Later
- [ ] Firebase Hosting + Firestore + Vite migration (see FUTURE_MIGRATION_NOTES.md).
- [ ] Counties beyond Ada and Canyon.
- [ ] Access model beyond two hardcoded emails.

---

## Done

| Date | Change |
|---|---|
| 2026-10-20 | Ownership snapshots are now rolling local files: script keeps the last 3, folder gitignored |
| 2026-10-20 | Mobile pass 2: Referral Partners and Mailers tables become cards on phones, summary boxes three across |
| 2026-10-20 | Mobile pass 1: client list on the first phone screen (compact stats and rates, collapsible filters), no zoom-on-tap, 44px touch targets, tighter header, form Save bar pinned to bottom |
| 2026-10-20 | One-click mailing address suggestion from the borrower's current owner-occupied loan (skips homes no longer owned); review-list rows open the exact record |
| 2026-10-20 | Rebased onto origin and pushed the pending June work (snapshot tool, PATH fix, docs) with this release |
| 2026-10-20 | Mailing address for second home / investment properties: form, drawer, import columns, mailers use it, flagged when missing |
| 2026-10-20 | Status audit: found nightly job stalled since 09-13; verified Ada and Canyon scrapers working |
| 2026-06-29 | Data fix in live DB: removed a referral partner's name wrongly embedded in a client name field (no code change) |
| 2026-06-29 | Build spec (BUILD_SPEC.md) and operations guide (DOCUMENTATION.md) |
| 2026-06-20 | Snapshot script finds the firebase CLI in scheduled runs and fails loudly instead of silently |
| 2026-06-19 | Daily ownership snapshot tool with dashboard-matched dedup counts |
| 2026-06-17 | Provider breakage detection and alerting in the nightly run |
| 2026-06-17 | Address enrichment from county assessors |
| 2026-06-17 | Ownership status filtering and mail merge page |
| 2026-06-15 | Nightly ownership verification Cloud Functions |
| 2026-06-10 | Ownership badges, current-loan dashboard view, multi-word search, referral alias cleanup, related-loan address matching |
