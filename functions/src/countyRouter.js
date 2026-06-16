'use strict';

const { CITY_COUNTY, ZIP_COUNTY, SUPPORTED_COUNTIES } = require('./config');

const SUPPORTED_COUNTY_SET = new Set(SUPPORTED_COUNTIES);

// Decide which county portal owns a client record. Returns a supported county
// slug (currently 'ada' | 'canyon') or null for "unsupported / unknown".
// Future counties should be added to SUPPORTED_COUNTIES plus city/zip tables.
function routeCounty(client) {
  if (!client) return null;

  const explicit = (client.county || '').toString().trim().toLowerCase();
  if (SUPPORTED_COUNTY_SET.has(explicit)) return explicit;

  const city = (client.city || '').toString().trim().toLowerCase();
  if (CITY_COUNTY[city]) return CITY_COUNTY[city];

  const zip = (client.zip || '').toString().trim().slice(0, 5);
  if (ZIP_COUNTY[zip]) return ZIP_COUNTY[zip];

  // Idaho-only product; if state is set and not ID, definitely skip.
  return null;
}

module.exports = { routeCounty };
