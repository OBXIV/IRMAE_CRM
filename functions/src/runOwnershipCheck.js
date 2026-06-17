'use strict';

const { matchOwnership } = require('./matchOwnership');
const { routeCounty } = require('./countyRouter');
const { getProvider } = require('./providers');
const { addressPatchFromSitus, pickStreetOnlyWinner } = require('./enrichAddress');
const {
  REQUEST_DELAY_MS,
  RECHECK_AFTER_DAYS,
  MAX_LOOKUPS_PER_RUN,
  SUPPORTED_COUNTIES,
} = require('./config');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function recentlyChecked(client, now) {
  if (!client.ownershipCheckedAt) return false;
  const ageDays = (now - Number(client.ownershipCheckedAt)) / 86400000;
  return ageDays < RECHECK_AFTER_DAYS;
}

// A record qualifies for the street-only two-signal probe when it has a street
// but no city/zip/county to route on. Idaho-only, and throttled so unresolved
// records are not re-probed every night.
function eligibleForStreetOnly(client, now) {
  if (!client.address) return false;
  // Only the truly street-only case: nothing to route on. A record that has a
  // city or zip which simply isn't Ada/Canyon is unsupported, not missing.
  if (String(client.city || '').trim()) return false;
  if (String(client.zip || '').trim()) return false;
  if (String(client.county || '').trim()) return false;
  const state = String(client.state || '').trim().toUpperCase();
  if (state && state !== 'ID') return false;
  if (client.addressEnrichmentLastAttemptAt) {
    const ageDays = (now - Number(client.addressEnrichmentLastAttemptAt)) / 86400000;
    if (ageDays < RECHECK_AFTER_DAYS) return false;
  }
  return true;
}

function statusPatchIfMissing(client) {
  return client.ownershipStatus ? {} : { ownershipStatus: 'unverified' };
}

// Core run loop. `db` is an admin RTDB instance; `now` is injectable for tests.
// Returns a summary object. Never throws on a single-client failure — a failed
// lookup leaves that record's ownershipStatus untouched (the key invariant).
async function runOwnershipCheck(
  db,
  {
    now = Date.now(),
    logger = console,
    getProviderForCounty = getProvider,
    delayMs = REQUEST_DELAY_MS,
  } = {},
) {
  const snap = await db.ref('clients').once('value');
  const clients = snap.val() || {};
  const ids = Object.keys(clients);

  const summary = {
    scanned: ids.length,
    looked_up: 0,
    updated: 0,
    skipped_no_county: 0,
    unsupported_county: 0,
    skipped_recent: 0,
    skipped_no_address: 0,
    failed: 0,
    address_enriched: 0,
    address_needs_review: 0,
    street_only_probed: 0,
    by_status: { verified: 0, trust: 0, entity: 0, nlor: 0 },
  };

  for (const id of ids) {
    if (summary.looked_up >= MAX_LOOKUPS_PER_RUN) {
      logger.info(`[ownership] hit MAX_LOOKUPS_PER_RUN (${MAX_LOOKUPS_PER_RUN}); stopping early`);
      break;
    }

    const client = clients[id] || {};
    if (!client.address) { summary.skipped_no_address++; continue; }
    if (recentlyChecked(client, now)) { summary.skipped_recent++; continue; }

    const county = routeCounty(client);
    if (!county) {
      // No city/zip/county to route on. If we still have a street, try the
      // two-signal probe: search both Idaho counties and accept an address only
      // when exactly one county's owner confidently matches the borrower.
      if (eligibleForStreetOnly(client, now) && summary.looked_up < MAX_LOOKUPS_PER_RUN) {
        const candidates = [];
        for (const probeCounty of SUPPORTED_COUNTIES) {
          if (summary.looked_up >= MAX_LOOKUPS_PER_RUN) break;
          const probeProvider = getProviderForCounty(probeCounty);
          if (!probeProvider) continue;
          summary.looked_up++;
          try {
            const r = await probeProvider.lookupOwner(client);
            candidates.push({ county: probeCounty, result: r });
          } catch (err) {
            logger.warn(`[ownership] street-only probe failed for ${id} (${probeCounty}): ${err && err.message}`);
            candidates.push({ county: probeCounty, result: null });
          }
          await sleep(delayMs);
        }
        summary.street_only_probed++;

        const winner = pickStreetOnlyWinner(client, candidates);
        if (winner) {
          await db.ref(`clients/${id}`).update({
            city: winner.parsed.city,
            state: winner.parsed.state,
            zip: winner.parsed.zip,
            county: winner.county,
            ownershipStatus: 'verified',
            ownershipOwnerName: winner.ownerName,
            ownershipSource: winner.county,
            ownershipCheckedAt: now,
            ownershipCheckStatus: 'checked',
            ownershipSupportedCounty: true,
            ownershipLastError: null,
            ownershipLastAttemptAt: now,
            addressEnrichmentStatus: 'enriched',
            addressEnrichmentSource: winner.county,
            addressEnrichmentAt: now,
            addressEnrichmentLastAttemptAt: now,
          });
          summary.updated++;
          summary.by_status.verified++;
          summary.address_enriched++;
        } else {
          await db.ref(`clients/${id}`).update({
            ...statusPatchIfMissing(client),
            addressEnrichmentStatus: 'needs_review',
            addressEnrichmentLastAttemptAt: now,
            ownershipLastAttemptAt: now,
          });
          summary.address_needs_review++;
        }
        continue;
      }

      await db.ref(`clients/${id}`).update({
        ...statusPatchIfMissing(client),
        ownershipCheckStatus: 'unsupported_county',
        ownershipSupportedCounty: false,
        ownershipLastAttemptAt: now,
        ownershipLastError: 'unsupported_county',
      });
      summary.skipped_no_county++;
      summary.unsupported_county++;
      continue;
    }

    const provider = getProviderForCounty(county);
    if (!provider) {
      await db.ref(`clients/${id}`).update({
        ...statusPatchIfMissing(client),
        ownershipCheckStatus: 'unsupported_county',
        ownershipSupportedCounty: false,
        ownershipLastAttemptAt: now,
        ownershipLastError: `unsupported_county:${county}`,
      });
      summary.skipped_no_county++;
      summary.unsupported_county++;
      continue;
    }

    summary.looked_up++;
    try {
      const result = await provider.lookupOwner(client);
      const ownerName = result && result.ownerName;
      const match = matchOwnership(
        ownerName,
        client.borrower1first,
        client.borrower1last,
      );

      // The county was authoritative (routed from the record's own city/zip), so
      // a street-anchored situs is safe to backfill regardless of owner match.
      const addrPatch = addressPatchFromSitus(client, result && result.situsRaw);
      const addrMeta = addrPatch
        ? {
          ...addrPatch,
          addressEnrichmentStatus: 'enriched',
          addressEnrichmentSource: county,
          addressEnrichmentAt: now,
          addressEnrichmentLastAttemptAt: now,
        }
        : {};
      if (addrPatch) summary.address_enriched++;

      if (!match) {
        // Indeterminate: record the attempt, but DO NOT touch ownershipStatus.
        await db.ref(`clients/${id}`).update({
          ...statusPatchIfMissing(client),
          ...addrMeta,
          ownershipCheckStatus: ownerName ? 'no_confident_match' : 'no_owner_found',
          ownershipSupportedCounty: true,
          ownershipLastAttemptAt: now,
          ownershipLastError: ownerName ? 'no_confident_match' : 'no_owner_found',
        });
        summary.failed++;
      } else {
        await db.ref(`clients/${id}`).update({
          ...addrMeta,
          ownershipStatus: match.status,
          ownershipCheckedAt: now,
          ownershipOwnerName: match.ownerName,
          ownershipSource: county,
          ownershipCheckStatus: 'checked',
          ownershipSupportedCounty: true,
          ownershipLastError: null,
          ownershipLastAttemptAt: now,
        });
        summary.updated++;
        summary.by_status[match.status]++;
      }
    } catch (err) {
      // Network / HTTP / parse failure: leave existing status alone.
      await db.ref(`clients/${id}`).update({
        ...statusPatchIfMissing(client),
        ownershipCheckStatus: 'lookup_failed',
        ownershipSupportedCounty: true,
        ownershipLastAttemptAt: now,
        ownershipLastError: String(err && err.message || err).slice(0, 200),
      }).catch(() => {});
      summary.failed++;
      logger.warn(`[ownership] lookup failed for ${id} (${county}): ${err && err.message}`);
    }

    await sleep(delayMs);
  }

  logger.info(`[ownership] run complete: ${JSON.stringify(summary)}`);
  return summary;
}

module.exports = { runOwnershipCheck };
