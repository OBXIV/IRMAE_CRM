'use strict';

// Provider registry. Each provider implements:
//   lookupOwner(client) -> Promise<{ ownerName } | null>   (throws on HTTP error)
//   county: county slug from SUPPORTED_COUNTIES
//
// To add a county later:
//   1) add <county>Provider.js exposing lookupOwner(client)
//   2) register it in PROVIDERS below
//   3) add the slug to SUPPORTED_COUNTIES and city/zip entries in config.js
//   4) validate with tools/tryAddress.js before trusting nightly writes
//
// To add ATTOM later, expose the same lookupOwner shape and either register it
// as a county fallback here or route selected counties to it.
const ada = require('./adaProvider');
const canyon = require('./canyonProvider');

const PROVIDERS = {
  ada,
  canyon,
};

function getProvider(county) {
  return PROVIDERS[county] || null;
}

module.exports = { getProvider, PROVIDERS };
