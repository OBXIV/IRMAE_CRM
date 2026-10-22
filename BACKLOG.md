# IRMAE CRM Backlog

Open work only. When an item ships, remove it here and add a row to the change log in [HISTORY.md](HISTORY.md), in the same commit as the change.

This repo is public. Keep client names, record IDs, and any client data out of this file and out of commit messages.

Priority: P0 broken in production · P1 needed soon · P2 cleanup / hardening

---

## Open

### P0
- [ ] **Stale-heartbeat check.** Have `scripts/ownership-snapshot.js` read `/systemHealth/ownership.at` and flag it when older than 36h. Today alerts only fire on a failed run, so a job that never runs goes unnoticed (it did, for 5 weeks).

### P1
- [ ] **Watch the ownership catch-up.** Every record came due during the outage. A 7 minute run covers about 68 county lookups, so rechecking everything takes roughly 4 to 5 more nights. Runs that hit the budget are expected and still record a healthy heartbeat.
- [ ] **Work down address needs-review queue.** 252 records flagged `needs_review`, flat since at least 2026-10-15. Consider a review-queue view in the app so they can be cleared in one pass.
- [ ] **Confirm the log-based alert policy exists** for `[ownership][ALERT]` (DOCUMENTATION.md section 7). The Sep 13 alert does not appear to have reached anyone.

- [ ] **Fill mailing addresses on non-primary records.** 48 second home / investment records show "Needs mailing address". 9 have a one-click suggestion (Mailers > address review, or the drawer); the other 39 need the address entered by hand.

- [ ] **Check mobile on a real iPhone.** Emulator testing done; confirm Safari specifics (notch, collapsing toolbar, form Save bar) on her phone.

- [ ] **Per-client notes / dated contact log.** No place to record a call or a note today. Add a dated notes box on the client drawer so manual outreach and status work have a home. Pairs with the Refi Watch worklist (a "contacted" entry could capture what was said).

### P2
- [ ] Normalize non-standard property type values: `Inv` (2 records, treated as investment), plus one `P` and one `R` that look like loan type entered in the wrong field.
- [ ] Optional instant alerts: set `OWNERSHIP_ALERT_WEBHOOK_URL` and add it to the function's secrets.
- [ ] `functions/src/config.js` `ZIP_COUNTY` has duplicate keys (`83702` twice, `83607` three times). Harmless, but clean up.
- [ ] Dedup logic in `scripts/ownership-snapshot.js` is copied from `index.html`. Extract a shared module so the two cannot drift.

### Later
- [ ] Firebase Hosting + Firestore + Vite migration (see FUTURE_MIGRATION_NOTES.md).
- [ ] Counties beyond Ada and Canyon.
- [ ] Access model beyond two hardcoded emails.
