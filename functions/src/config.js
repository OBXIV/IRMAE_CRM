'use strict';

// How long between client lookups, to stay gentle on county portals and
// reduce the chance of being rate-limited / IP-blocked.
const REQUEST_DELAY_MS = 1800;

// Per-HTTP-request timeout. Ada detail pages can be slow because they include
// embedded property imagery; callers still fail safe and leave status intact.
const REQUEST_TIMEOUT_MS = 45000;

// Re-check a client at most this often. Skips records verified recently so a
// nightly run spreads load and converges instead of hammering every record.
const RECHECK_AFTER_DAYS = 30;

// Hard cap on lookups per run (backstop against runaway cost / blocks).
const MAX_LOOKUPS_PER_RUN = 400;

// Counties with an implemented provider. Add new county slugs here only after
// adding a provider and route table entries.
const SUPPORTED_COUNTIES = ['ada', 'canyon'];

// Browser-like UA. County portals tend to 403 obvious bots.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// City -> county routing for the Boise/Nampa metro. Lowercased keys.
const CITY_COUNTY = {
  boise: 'ada',
  'garden city': 'ada',
  meridian: 'ada',
  eagle: 'ada',
  star: 'ada',
  kuna: 'ada',
  'boise city': 'ada',
  nampa: 'canyon',
  caldwell: 'canyon',
  middleton: 'canyon',
  greenleaf: 'canyon',
  wilder: 'canyon',
  notus: 'canyon',
  parma: 'canyon',
  melba: 'canyon',
};

// Zip prefixes as a fallback when city is missing/misspelled.
// Ada (Boise area) 836xx; Canyon (Nampa/Caldwell) 836xx overlaps, so we list
// the specific zips we can attribute confidently.
const ZIP_COUNTY = {
  // Ada
  '83702': 'ada', '83703': 'ada', '83704': 'ada', '83705': 'ada',
  '83706': 'ada', '83709': 'ada', '83712': 'ada', '83713': 'ada',
  '83714': 'ada', '83716': 'ada', '83702': 'ada', '83646': 'ada',
  '83642': 'ada', '83669': 'ada', '83634': 'ada', '83616': 'ada',
  // Canyon
  '83605': 'canyon', '83607': 'canyon', '83651': 'canyon', '83686': 'canyon',
  '83687': 'canyon', '83644': 'canyon', '83607': 'canyon', '83660': 'canyon',
  '83626': 'canyon', '83655': 'canyon', '83607': 'canyon',
};

module.exports = {
  REQUEST_DELAY_MS,
  REQUEST_TIMEOUT_MS,
  RECHECK_AFTER_DAYS,
  MAX_LOOKUPS_PER_RUN,
  SUPPORTED_COUNTIES,
  USER_AGENT,
  CITY_COUNTY,
  ZIP_COUNTY,
};
