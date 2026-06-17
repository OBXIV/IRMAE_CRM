'use strict';

const { httpGet } = require('./http');

const BASE = 'https://id-canyon.publicaccessnow.com';
const SEARCH_URL = `${BASE}/Assessor/PropertySearch.aspx`;
const QUICK_SEARCH_URL = `${BASE}/DesktopModules/QuickSearch/API/Module/GetData`;

// These are rendered in the public page for the QuickSearch module.
const MODULE_ID = '470';
const TAB_ID = '38';

function normalizeAddress(address) {
  return String(address || '')
    .replace(/\b(LANE)\b/ig, 'LN')
    .replace(/\b(STREET)\b/ig, 'ST')
    .replace(/\b(AVENUE)\b/ig, 'AVE')
    .replace(/\b(ROAD)\b/ig, 'RD')
    .replace(/\s+/g, ' ')
    .trim();
}

function queryCandidates(client) {
  const address = normalizeAddress(client.address);
  if (!address) return [];
  const m = address.match(/^(\d+\s+\S+)/);
  return [...new Set([
    address,
    m ? m[1] : '',
  ].filter(Boolean))];
}

async function lookupOwner(client) {
  for (const q of queryCandidates(client)) {
    const url = `${QUICK_SEARCH_URL}?keywords=${encodeURIComponent(q)}&page=1`;
    const res = await httpGet(url, {
      Referer: SEARCH_URL,
      ModuleId: MODULE_ID,
      TabId: TAB_ID,
      Accept: 'application/json,text/plain,*/*',
    });
    const data = JSON.parse(res.text);
    const first = data && Array.isArray(data.items) ? data.items[0] : null;
    const owner = first && first.fields && first.fields.Owner;
    if (owner) {
      const situsRaw = first.fields.Situs
        ? String(first.fields.Situs).replace(/\s+/g, ' ').trim()
        : '';
      const ownerName = String(owner).replace(/\s+/g, ' ').trim();
      return situsRaw ? { ownerName, situsRaw } : { ownerName };
    }
  }
  return null;
}

module.exports = {
  lookupOwner,
  county: 'canyon',
  BASE,
  SEARCH_URL,
  QUICK_SEARCH_URL,
  normalizeAddress,
  queryCandidates,
};
