'use strict';

// Parse a county assessor "situs" string into mailing components.
//
// Idaho assessors return the full property address alongside owner data:
//   Ada:    "200 W FRONT ST    BOISE, ID 837020000"   (search row .address)
//   Canyon: "1115 ALBANY ST CALDWELL ID 83605"        (item.fields.Situs)
//
// We already hold the borrower's street (client.address). The hard part of a
// raw situs is separating the street from the city when there is no comma
// (Canyon). We anchor on the known street to split reliably, and fall back to
// the trailing token when the street cannot be matched.

const SUFFIX_MAP = {
  LANE: 'LN', STREET: 'ST', AVENUE: 'AVE', ROAD: 'RD', DRIVE: 'DR',
  COURT: 'CT', PLACE: 'PL', BOULEVARD: 'BLVD', CIRCLE: 'CIR',
  TERRACE: 'TER', PARKWAY: 'PKWY', HIGHWAY: 'HWY',
};

function normLoose(s) {
  return String(s || '').toUpperCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Word-for-word normalization (token count is preserved) so a known street can
// be matched against a situs prefix regardless of suffix spelling.
function normStreetTokens(s) {
  return normLoose(s).split(' ').filter(Boolean).map((w) => SUFFIX_MAP[w] || w);
}

function titleCase(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\b([a-z])/g, (m, c) => c.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

// Returns { city, state, zip, confident } or null if no zip/state could be read.
// `confident` is true only when the known street anchored the city split.
function parseSitus(raw, knownStreet) {
  const clean = normLoose(raw);
  if (!clean) return null;

  const zipM = clean.match(/(\d{5})(?:-?\d{4})?\s*$/);
  if (!zipM) return null;
  const zip = zipM[1];
  let rest = clean.slice(0, zipM.index).trim();

  const stM = rest.match(/\b([A-Z]{2})\s*$/);
  const state = stM ? stM[1] : '';
  if (stM) rest = rest.slice(0, stM.index).trim();
  if (!state) return null;

  // rest is now "STREET CITY"; split using the known street as an anchor.
  const restTokens = rest.split(' ').filter(Boolean);
  const restNorm = normStreetTokens(rest);
  const ks = normStreetTokens(knownStreet);

  let cityTokens = null;
  let confident = false;
  if (ks.length && ks.length < restNorm.length &&
      restNorm.slice(0, ks.length).join(' ') === ks.join(' ')) {
    cityTokens = restTokens.slice(ks.length);
    confident = true;
  } else if (restTokens.length) {
    // Fallback: assume the city is the trailing token (e.g. "BOISE").
    cityTokens = restTokens.slice(-1);
  }

  const city = titleCase((cityTokens || []).join(' '));
  if (!city) return null;
  return { city, state, zip, confident };
}

// Which mailing fields a record is missing (street is assumed present upstream).
function missingAddressParts(client) {
  const missing = [];
  if (!String(client.city || '').trim()) missing.push('city');
  if (!String(client.state || '').trim()) missing.push('state');
  if (!String(client.zip || '').trim()) missing.push('zip');
  return missing;
}

module.exports = { parseSitus, missingAddressParts, normStreetTokens, titleCase };
