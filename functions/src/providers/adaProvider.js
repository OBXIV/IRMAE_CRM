'use strict';

const cheerio = require('cheerio');
const { httpGet, httpPostForm } = require('./http');

// Ada County's current public app requires accepting terms before searching.
// The accepted-terms POST sets a short-lived ViewedTerms cookie; then address
// search returns parcel summaries and the parcel detail page exposes owner.
const BASE = 'https://apps.adacounty.id.gov';
const ROOT_URL = `${BASE}/PropertyLookup/`;
const SEARCH_URL = `${BASE}/PropertyLookup/SearchProperty`;
const DETAIL_URL = `${BASE}/PropertyLookup/PropertyDetails`;

function cookieHeader(headers) {
  const getSetCookie = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [];
  const raw = getSetCookie.length ? getSetCookie : [headers.get('set-cookie')].filter(Boolean);
  return raw
    .flatMap((c) => c.split(/,(?=\s*[^;,]+=)/))
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

function mergeCookies(...parts) {
  const jar = new Map();
  parts.filter(Boolean).join('; ').split(';').forEach((part) => {
    const trimmed = part.trim();
    const idx = trimmed.indexOf('=');
    if (idx > 0) jar.set(trimmed.slice(0, idx), trimmed.slice(idx + 1));
  });
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function antiforgeryToken(html) {
  const $ = cheerio.load(html);
  return $('input[name="__RequestVerificationToken"]').first().attr('value') || '';
}

async function createSession() {
  const seed = await httpGet(ROOT_URL, { Referer: BASE });
  const token = antiforgeryToken(seed.text);
  if (!token) throw new Error('Ada terms page missing antiforgery token');

  const accepted = await httpPostForm(
    `${BASE}/PropertyLookup?handler=AcceptedTerms`,
    {
      'g-recaptcha-response': '',
      __RequestVerificationToken: token,
    },
    {
      Cookie: cookieHeader(seed.headers),
      Referer: ROOT_URL,
    },
    {
      redirect: 'manual',
      allowStatuses: [302, 303],
    },
  );

  const cookie = mergeCookies(cookieHeader(seed.headers), cookieHeader(accepted.headers));
  const searchPage = await httpGet(SEARCH_URL, {
    Cookie: cookie,
    Referer: ROOT_URL,
  });

  return {
    cookie: mergeCookies(cookie, cookieHeader(searchPage.headers)),
    token: antiforgeryToken(searchPage.text),
  };
}

function buildAddressQuery(client) {
  const raw = (client.address || '').trim().replace(/\s+/g, ' ');
  const m = raw.match(/^(\d+)\s+(.+)$/);
  if (!m) return { streetNum: '0', address: raw };
  return { streetNum: m[1], address: m[2] };
}

function normalizeStreetForSearch(street) {
  return String(street || '')
    .replace(/\b(LANE)\b/ig, 'LN')
    .replace(/\b(STREET)\b/ig, 'ST')
    .replace(/\b(AVENUE)\b/ig, 'AVE')
    .replace(/\b(ROAD)\b/ig, 'RD')
    .replace(/\s+/g, ' ')
    .trim();
}

function selectedYear() {
  return String(new Date().getFullYear());
}

function parseSearchResults(text) {
  const rows = JSON.parse(text);
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    if (typeof row === 'string') return JSON.parse(row);
    return row;
  });
}

function extractOwnerFromDetails(html) {
  const $ = cheerio.load(html);
  const details = $('#detailsPane').text().replace(/\s+/g, ' ').trim()
    || $('body').text().replace(/\s+/g, ' ').trim();
  const m = details.match(/Primary Owner:\s*(.+?)\s+\d{2}\/\d{2}\/\d{4}\s+Address:/i)
    || details.match(/Primary Owner:\s*(.+?)\s+Address:/i);
  return m ? m[1].trim() : '';
}

// Returns { ownerName } on success, or null if no owner could be read.
// Throws on network/HTTP error (treated upstream as "leave status unchanged").
async function lookupOwner(client) {
  const q = buildAddressQuery(client);
  if (!q.address) return null;

  const session = await createSession();
  if (!session.token) throw new Error('Ada search page missing antiforgery token');

  const year = selectedYear();
  const search = await httpPostForm(
    `${SEARCH_URL}?handler=SearchByAddress`,
    {
      streetNum: q.streetNum,
      address: normalizeStreetForSearch(q.address),
      year,
    },
    {
      Cookie: session.cookie,
      Referer: SEARCH_URL,
      RequestVerificationToken: session.token,
      'X-Requested-With': 'XMLHttpRequest',
    },
  );

  const results = parseSearchResults(search.text);
  if (!results.length) return null;

  const parcelNumber = results[0] && results[0].parcelNumber;
  if (!parcelNumber) return null;

  // The search row already carries the full situs ("STREET    CITY, ST ZIP").
  const situsRaw = (results[0] && results[0].address || '').replace(/\s+/g, ' ').trim();

  const detail = await httpGet(
    `${DETAIL_URL}?parcel=${encodeURIComponent(parcelNumber)}&year=${encodeURIComponent(year)}`,
    {
      Cookie: mergeCookies(session.cookie, cookieHeader(search.headers)),
      Referer: SEARCH_URL,
    },
  );
  const ownerName = extractOwnerFromDetails(detail.text).replace(/\s+/g, ' ').trim();
  if (!ownerName) return null;
  return situsRaw ? { ownerName, situsRaw } : { ownerName };
}

module.exports = {
  lookupOwner,
  county: 'ada',
  BASE,
  SEARCH_URL,
  DETAIL_URL,
  buildAddressQuery,
  normalizeStreetForSearch,
  extractOwnerFromDetails,
};
