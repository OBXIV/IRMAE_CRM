'use strict';

const { parseSitus, missingAddressParts } = require('./addressUtils');
const { matchOwnership } = require('./matchOwnership');

// Build a patch that fills ONLY the missing mailing parts of a client from the
// situs of the parcel its street search matched. Requires a street-anchored
// (confident) parse so we never write a city the known street did not confirm.
// Returns { city?, state?, zip? } or null when nothing should be written.
function addressPatchFromSitus(client, situsRaw) {
  const missing = missingAddressParts(client);
  if (!missing.length || !situsRaw) return null;
  const parsed = parseSitus(situsRaw, client.address);
  if (!parsed || !parsed.confident) return null;

  const patch = {};
  if (missing.includes('city')) patch.city = parsed.city;
  if (missing.includes('state')) patch.state = parsed.state;
  if (missing.includes('zip')) patch.zip = parsed.zip;
  return Object.keys(patch).length ? patch : null;
}

// Two-signal resolution for street-only records (no city/zip to route on).
// `candidates` is [{ county, result }] where result is a provider response
// ({ ownerName, situsRaw } | null). A winner requires EXACTLY ONE county whose
// owner name confidently matches the borrower AND whose situs parses with the
// street anchored. Anything else returns null -> caller routes to needs_review.
function pickStreetOnlyWinner(client, candidates) {
  const winners = [];
  for (const c of candidates || []) {
    const result = c && c.result;
    if (!result || !result.situsRaw) continue;
    const parsed = parseSitus(result.situsRaw, client.address);
    if (!parsed || !parsed.confident) continue;
    const match = matchOwnership(result.ownerName, client.borrower1first, client.borrower1last);
    if (match && match.status === 'verified') {
      winners.push({ county: c.county, parsed, ownerName: match.ownerName });
    }
  }
  return winners.length === 1 ? winners[0] : null;
}

module.exports = { addressPatchFromSitus, pickStreetOnlyWinner };
