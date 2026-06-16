'use strict';

const { matchOwnership } = require('./matchOwnership');
const { routeCounty } = require('./countyRouter');
const { getProvider } = require('./providers');
const {
  REQUEST_DELAY_MS,
  RECHECK_AFTER_DAYS,
  MAX_LOOKUPS_PER_RUN,
} = require('./config');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function recentlyChecked(client, now) {
  if (!client.ownershipCheckedAt) return false;
  const ageDays = (now - Number(client.ownershipCheckedAt)) / 86400000;
  return ageDays < RECHECK_AFTER_DAYS;
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

      if (!match) {
        // Indeterminate: record the attempt, but DO NOT touch ownershipStatus.
        await db.ref(`clients/${id}`).update({
          ...statusPatchIfMissing(client),
          ownershipCheckStatus: ownerName ? 'no_confident_match' : 'no_owner_found',
          ownershipSupportedCounty: true,
          ownershipLastAttemptAt: now,
          ownershipLastError: ownerName ? 'no_confident_match' : 'no_owner_found',
        });
        summary.failed++;
      } else {
        await db.ref(`clients/${id}`).update({
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
