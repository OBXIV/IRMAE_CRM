'use strict';

// Local tuning harness — validate a county scraper against ONE real address
// without deploying. This is how you confirm the scraper selectors are right.
//
// Usage:
//   node test/tryAddress.js ada    "1234 W State St"
//   node test/tryAddress.js canyon "987 Main St" --first John --last Smith
//
// It prints the raw owner name the scraper read, plus how matchOwnership would
// classify it. If ownerName is empty, open the printed URL in a browser, find
// the owner field in DevTools, and adjust the provider's selectors.

const { getProvider } = require('../src/providers');
const { matchOwnership } = require('../src/matchOwnership');

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function main() {
  const county = process.argv[2];
  const address = process.argv[3];
  if (!county || !address) {
    console.error('usage: node test/tryAddress.js <ada|canyon> "<address>" [--city C] [--zip Z] [--first F] [--last L]');
    process.exit(1);
  }
  const provider = getProvider(county);
  if (!provider) {
    console.error(`unknown county: ${county}`);
    process.exit(1);
  }

  const client = {
    address,
    city: arg('--city', ''),
    zip: arg('--zip', ''),
    borrower1first: arg('--first', ''),
    borrower1last: arg('--last', ''),
  };

  console.log(`Looking up [${county}]:`, address);
  try {
    const result = await provider.lookupOwner(client);
    console.log('owner read:', result ? JSON.stringify(result) : 'null (no owner found)');
    const match = matchOwnership(
      result && result.ownerName,
      client.borrower1first,
      client.borrower1last,
    );
    console.log('classification:', match ? JSON.stringify(match) : 'null (indeterminate — status would be left unchanged)');
  } catch (err) {
    console.error('lookup threw (status would be left unchanged):', err.message);
    if (err.status) console.error('http status:', err.status);
  }
}

main();
