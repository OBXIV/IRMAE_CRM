'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { routeCounty } = require('../src/countyRouter');
const { getProvider } = require('../src/providers');

test('routes Ada city to Ada provider', () => {
  const county = routeCounty({ city: 'Boise' });
  assert.strictEqual(county, 'ada');
  assert.strictEqual(getProvider(county).county, 'ada');
});

test('routes Ada zip to Ada provider', () => {
  const county = routeCounty({ zip: '83704' });
  assert.strictEqual(county, 'ada');
  assert.strictEqual(getProvider(county).county, 'ada');
});

test('routes Canyon city to Canyon provider', () => {
  const county = routeCounty({ city: 'Nampa' });
  assert.strictEqual(county, 'canyon');
  assert.strictEqual(getProvider(county).county, 'canyon');
});

test('routes Canyon zip to Canyon provider', () => {
  const county = routeCounty({ zip: '83651' });
  assert.strictEqual(county, 'canyon');
  assert.strictEqual(getProvider(county).county, 'canyon');
});

test('unknown county routes to unsupported', () => {
  assert.strictEqual(routeCounty({
    county: 'twin falls',
    city: 'Twin Falls',
    zip: '83301',
  }), null);
});
