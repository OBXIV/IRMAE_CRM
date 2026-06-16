'use strict';

const test = require('node:test');
const assert = require('node:assert');

const ada = require('../src/providers/adaProvider');
const canyon = require('../src/providers/canyonProvider');

test('Ada address query splits street number from street name', () => {
  assert.deepStrictEqual(ada.buildAddressQuery({
    address: '4600 W Gillette St',
  }), {
    streetNum: '4600',
    address: 'W Gillette St',
  });
});

test('Ada owner extractor reads primary owner from detail text', () => {
  const html = '<div id="detailsPane">Primary Owner: ACACIA LIVING TRUST 07/24/2024 Address: 4600 W GILLETTE ST</div>';
  assert.strictEqual(ada.extractOwnerFromDetails(html), 'ACACIA LIVING TRUST');
});

test('Canyon normalizes long street suffixes for QuickSearch', () => {
  assert.strictEqual(canyon.normalizeAddress('5337 Joe Lane'), '5337 Joe LN');
});

test('Canyon query candidates include shorter number and street token', () => {
  assert.deepStrictEqual(canyon.queryCandidates({
    address: '5337 Joe Lane',
  }), ['5337 Joe LN', '5337 Joe']);
});
