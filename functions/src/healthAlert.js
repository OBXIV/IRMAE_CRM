'use strict';

// A county page change typically breaks a provider in one of two ways: the
// request throws (HTTP/structure), or the page still loads but our selectors no
// longer find the owner (every lookup returns null). One null is normal — an
// address simply not in that county — so we only alarm when a provider returns
// ZERO owners across a meaningful number of routed attempts.
//
// `health` is { [county]: { attempts, owners, errors } } collected on the
// ROUTABLE path only (where the county is authoritative and an owner is
// expected). Street-only probes are excluded because nulls there are normal.

function detectBrokenProviders(health, minSample) {
  const broken = [];
  for (const [county, h] of Object.entries(health || {})) {
    if (h && h.attempts >= minSample && h.owners === 0) {
      broken.push({
        county,
        attempts: h.attempts,
        errors: h.errors || 0,
        detail: `${county}: 0/${h.attempts} lookups returned an owner` +
          (h.errors ? ` (${h.errors} threw)` : ''),
      });
    }
  }
  return broken;
}

function buildAlertMessage(broken, now) {
  const when = new Date(now).toISOString();
  return `[IRMAE CRM] Ownership check: provider(s) may be broken as of ${when} — ` +
    broken.map((b) => b.detail).join('; ') +
    '. A county likely changed its site; verify the scraper selectors.';
}

// Best-effort outbound notification. Returns true on a 2xx, false otherwise;
// never throws so a webhook outage cannot fail the nightly run.
async function postAlertWebhook(url, message, fetchImpl) {
  if (!url) return false;
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) return false;
  try {
    const res = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
    return !!(res && res.ok);
  } catch (_e) {
    return false;
  }
}

module.exports = { detectBrokenProviders, buildAlertMessage, postAlertWebhook };
