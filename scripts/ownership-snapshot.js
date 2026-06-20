#!/usr/bin/env node
// Daily ownership snapshot — reproduces the dashboard's deduplicated ("current rows")
// ownership counts so morning deltas are apples-to-apples with the UI.
//
// The dedup/bucketing helpers below are copied VERBATIM from index.html. If that
// grouping logic ever changes, update these to match (search the same function
// names in index.html). The script self-checks against a known good count on run.
//
// Usage:
//   node scripts/ownership-snapshot.js            # pull live DB, save snapshot, print delta
//   node scripts/ownership-snapshot.js --file x.json   # use a local /clients dump instead
//
// Snapshots are written to scripts/ownership-snapshots/YYYY-MM-DD.json

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SNAP_DIR = path.join(__dirname, 'ownership-snapshots');

// ---- helpers copied verbatim from index.html (pure logic only) -------------
const BORROWER_CANONICAL_NAMES = {
  'jamie kelley': 'Jamie Kelley',
  'jamison kelley': 'Jamie Kelley'
};
const STREET_DIRECTION_ALIASES = {
  n:'n',north:'n',s:'s',south:'s',e:'e',east:'e',w:'w',west:'w',
  ne:'ne',northeast:'ne',nw:'nw',northwest:'nw',se:'se',southeast:'se',sw:'sw',southwest:'sw'
};
const STREET_TYPE_ALIASES = {
  street:'st',st:'st',avenue:'ave',ave:'ave',road:'rd',rd:'rd',boulevard:'blvd',blvd:'blvd',
  drive:'dr',dr:'dr',lane:'ln',ln:'ln',court:'ct',ct:'ct',place:'pl',pl:'pl',circle:'cir',cir:'cir',
  terrace:'ter',ter:'ter',trail:'trl',trl:'trl',highway:'hwy',hwy:'hwy',parkway:'pkwy',pkwy:'pkwy',way:'way',loop:'loop'
};
const STREET_UNIT_MARKERS = new Set(['unit','apt','apartment','suite','ste','lot','space','bldg','building']);
const OWNERSHIP_META = {
  verified:{}, trust:{}, entity:{}, nlor:{}, unverified:{}
};

let clients = [];

function borrowerName(c, n) {
  return [c['borrower' + n + 'first'], c['borrower' + n + 'last']].filter(Boolean).join(' ');
}
function borrowerAliasKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function canonicalBorrowerName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  return BORROWER_CANONICAL_NAMES[borrowerAliasKey(name)] || name;
}
function normalizeHistoryKey(value) {
  return String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
}
function addressTokens(value) {
  return String(value || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
    .split(/\s+/).filter(Boolean)
    .map(token => STREET_DIRECTION_ALIASES[token] || STREET_TYPE_ALIASES[token] || token);
}
function parseStreetAddress(address) {
  const tokens = addressTokens(address);
  if (!tokens.length || !/^\d+[a-z]?$/.test(tokens[0])) return null;
  const houseNumber = tokens[0];
  let rest = tokens.slice(1);
  const unitIndex = rest.findIndex(token => STREET_UNIT_MARKERS.has(token));
  if (unitIndex >= 0) rest = rest.slice(0, unitIndex);
  let direction = '';
  if (rest.length && STREET_DIRECTION_ALIASES[rest[0]]) direction = rest.shift();
  let trailingDirection = '';
  if (rest.length && STREET_DIRECTION_ALIASES[rest[rest.length - 1]]) trailingDirection = rest.pop();
  let type = '';
  if (rest.length && STREET_TYPE_ALIASES[rest[rest.length - 1]]) type = rest.pop();
  const name = rest.join('');
  if (!name) return null;
  return { houseNumber, direction: direction || trailingDirection, name, type };
}
function streetAddressesMatch(a, b) {
  const aParsed = parseStreetAddress(a.address);
  const bParsed = parseStreetAddress(b.address);
  if (!aParsed || !bParsed) {
    const aAddress = normalizeHistoryKey(a.address);
    const bAddress = normalizeHistoryKey(b.address);
    return !!aAddress && aAddress === bAddress;
  }
  if (aParsed.houseNumber !== bParsed.houseNumber) return false;
  if (aParsed.name !== bParsed.name) return false;
  if (aParsed.type && bParsed.type && aParsed.type !== bParsed.type) return false;
  if (aParsed.direction && bParsed.direction && aParsed.direction !== bParsed.direction) return false;
  return true;
}
function locationsCompatible(a, b) {
  return ['city', 'state', 'zip'].every(field => {
    const aValue = normalizeHistoryKey(a[field]);
    const bValue = normalizeHistoryKey(b[field]);
    return !aValue || !bValue || aValue === bValue;
  });
}
function propertiesMatch(a, b) {
  if (!String(a.address || '').trim() || !String(b.address || '').trim()) return false;
  return streetAddressesMatch(a, b) && locationsCompatible(a, b);
}
function borrowerHistoryNames(c) {
  return [1,2,3,4].map(n => normalizeHistoryKey(canonicalBorrowerName(borrowerName(c, n)))).filter(Boolean);
}
function hasSharedBorrower(a, b) {
  const aNames = borrowerHistoryNames(a);
  const bNames = borrowerHistoryNames(b);
  if (!aNames.length || !bNames.length) return false;
  const bSet = new Set(bNames);
  return aNames.some(name => bSet.has(name));
}
function parseIsoLocalDate(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime()) || date.getFullYear() !== Number(match[1]) ||
      date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return null;
  return date;
}
function loanSortValue(c) {
  const parsed = parseIsoLocalDate(c.closing);
  if (parsed) return parsed.getTime();
  return Number(c.updatedAt || c.createdAt || 0);
}
function compareLoansNewestFirst(a, b) {
  const dateDiff = loanSortValue(b) - loanSortValue(a);
  if (dateDiff) return dateDiff;
  return String(b.id || '').localeCompare(String(a.id || ''));
}
function computeRelatedLoansForClient(client) {
  if (!client) return [];
  const hasNamedBorrower = borrowerHistoryNames(client).length > 0;
  if (!hasNamedBorrower && !String(client.address || '').trim()) return [client];
  const matches = clients.filter(c => {
    if (c.id === client.id) return true;
    if (hasNamedBorrower && hasSharedBorrower(client, c)) return true;
    return propertiesMatch(client, c) && hasSharedBorrower(client, c);
  });
  const requestedDirection = parseStreetAddress(client.address)?.direction || '';
  const matchedDirections = new Set(
    matches.map(c => parseStreetAddress(c.address)?.direction || '').filter(Boolean)
  );
  return matches.filter(c => {
    if (hasNamedBorrower) return true;
    const direction = parseStreetAddress(c.address)?.direction || '';
    if (requestedDirection && direction && direction !== requestedDirection) return false;
    if (!requestedDirection && direction && matchedDirections.size > 1) return false;
    return true;
  }).sort(compareLoansNewestFirst);
}
function sortedClients() {
  return [...clients].sort((a, b) => {
    if (!a.closing && !b.closing) return 0;
    if (!a.closing) return 1;
    if (!b.closing) return -1;
    return String(b.closing).localeCompare(String(a.closing));
  });
}
function currentClientRows() {
  const coveredIds = new Set();
  const currentRows = [];
  sortedClients().forEach(c => {
    if (coveredIds.has(c.id)) return;
    const related = computeRelatedLoansForClient(c);
    const current = related[0] || c;
    currentRows.push(current);
    related.forEach(loan => coveredIds.add(loan.id));
  });
  return currentRows.sort(compareLoansNewestFirst);
}
function clientOwnership(c) {
  const v = c && c.ownershipStatus;
  return OWNERSHIP_META[v] ? v : 'unverified';
}
// ---- end verbatim block ----------------------------------------------------

function loadClients(fileArg) {
  let raw;
  if (fileArg) {
    raw = fs.readFileSync(fileArg, 'utf8');
  } else {
    // Scheduled (non-login) runs don't inherit the interactive PATH, so the
    // homebrew/npm bin dirs that hold the firebase CLI may be missing. Add the
    // common locations and surface a clear error instead of dying silently.
    const env = { ...process.env };
    env.PATH = ['/opt/homebrew/bin', '/usr/local/bin', env.PATH].filter(Boolean).join(':');
    try {
      raw = execSync('firebase database:get /clients --project iramecrm', {
        encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env
      });
    } catch (err) {
      const msg = String(err.stderr || err.message || err);
      if (/command not found|ENOENT/.test(msg)) {
        throw new Error('firebase CLI not found on PATH. Install it or add its bin dir to PATH for scheduled runs.\n' + msg);
      }
      throw new Error('firebase database:get failed (auth or network). Run `firebase login` if this persists.\n' + msg);
    }
  }
  const obj = JSON.parse(raw);
  return Object.keys(obj).map(id => ({ id, ...obj[id] }));
}

function computeSnapshot() {
  const rows = currentClientRows();
  const buckets = { verified: 0, unverified: 0, trust: 0, entity: 0, nlor: 0 };
  let enriched = 0, needsReview = 0;
  rows.forEach(c => {
    buckets[clientOwnership(c)]++;
    if (c.addressEnrichmentStatus === 'enriched') enriched++;
    if (c.addressEnrichmentStatus === 'needs_review') needsReview++;
  });
  return {
    rawRecords: clients.length,
    currentRows: rows.length,
    ownership: buckets,
    needsFollowup: rows.length - buckets.verified,
    addressEnriched: enriched,
    addressNeedsReview: needsReview
  };
}

function localDateStamp() {
  // local YYYY-MM-DD without UTC drift
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function priorSnapshot(todayStamp) {
  if (!fs.existsSync(SNAP_DIR)) return null;
  const files = fs.readdirSync(SNAP_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f !== `${todayStamp}.json`)
    .sort();
  if (!files.length) return null;
  const f = files[files.length - 1];
  return { stamp: f.replace('.json', ''), data: JSON.parse(fs.readFileSync(path.join(SNAP_DIR, f), 'utf8')) };
}

function delta(a, b) {
  const s = n => (n >= 0 ? '+' + n : String(n));
  return s(a - b);
}

function main() {
  const fileArg = process.argv.includes('--file')
    ? process.argv[process.argv.indexOf('--file') + 1] : null;
  clients = loadClients(fileArg);

  const snap = computeSnapshot();
  const stamp = localDateStamp();

  if (!fs.existsSync(SNAP_DIR)) fs.mkdirSync(SNAP_DIR, { recursive: true });
  const outPath = path.join(SNAP_DIR, `${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ date: stamp, ...snap }, null, 2));

  const prior = priorSnapshot(stamp);
  console.log(`\nOwnership snapshot — ${stamp}`);
  console.log(`  current borrowers: ${snap.currentRows}  (raw rows: ${snap.rawRecords})`);
  console.log(`  verified:    ${snap.ownership.verified}` +
    (prior ? `   (${delta(snap.ownership.verified, prior.data.ownership.verified)} vs ${prior.stamp})` : ''));
  console.log(`  unverified:  ${snap.ownership.unverified}` +
    (prior ? `   (${delta(snap.ownership.unverified, prior.data.ownership.unverified)})` : ''));
  console.log(`  trust ${snap.ownership.trust} · entity ${snap.ownership.entity} · nlor ${snap.ownership.nlor}`);
  console.log(`  needs follow-up: ${snap.needsFollowup}`);
  console.log(`  address enriched: ${snap.addressEnriched}` +
    (prior ? `   (${delta(snap.addressEnriched, prior.data.addressEnriched)})` : ''));
  console.log(`  address needs review: ${snap.addressNeedsReview}` +
    (prior ? `   (${delta(snap.addressNeedsReview, prior.data.addressNeedsReview)})` : ''));
  if (!prior) console.log(`  (no prior snapshot yet — deltas start tomorrow)`);
  console.log(`\n  saved ${path.relative(process.cwd(), outPath)}\n`);
}

main();
