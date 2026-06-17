'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { parseSitus, missingAddressParts } = require('../src/addressUtils');
const { addressPatchFromSitus, pickStreetOnlyWinner } = require('../src/enrichAddress');

test('parseSitus reads Canyon situs (no comma) anchored on known street', () => {
  const r = parseSitus('1115 ALBANY ST CALDWELL ID 83605', '1115 Albany St');
  assert.deepStrictEqual(r, { city: 'Caldwell', state: 'ID', zip: '83605', confident: true });
});

test('parseSitus reads Ada situs with comma and 9-digit zip', () => {
  const r = parseSitus('200 W FRONT ST    BOISE, ID 837020000', '200 W Front St');
  assert.deepStrictEqual(r, { city: 'Boise', state: 'ID', zip: '83702', confident: true });
});

test('parseSitus handles multi-word city when street anchors the split', () => {
  const r = parseSitus('123 N MAIN ST GARDEN CITY ID 83714', '123 N Main Street');
  assert.deepStrictEqual(r, { city: 'Garden City', state: 'ID', zip: '83714', confident: true });
});

test('parseSitus falls back to trailing token (not confident) when street does not anchor', () => {
  const r = parseSitus('999 OTHER RD NAMPA ID 83651', '123 Main St');
  assert.strictEqual(r.city, 'Nampa');
  assert.strictEqual(r.confident, false);
});

test('parseSitus returns null without a zip', () => {
  assert.strictEqual(parseSitus('200 W FRONT ST BOISE ID', '200 W Front St'), null);
});

test('missingAddressParts lists only blank mailing fields', () => {
  assert.deepStrictEqual(missingAddressParts({ city: 'Boise', state: '', zip: '' }), ['state', 'zip']);
  assert.deepStrictEqual(missingAddressParts({ city: 'Boise', state: 'ID', zip: '83702' }), []);
});

test('addressPatchFromSitus fills only missing parts on a confident parse', () => {
  const client = { address: '1115 Albany St', city: '', state: 'ID', zip: '' };
  assert.deepStrictEqual(
    addressPatchFromSitus(client, '1115 ALBANY ST CALDWELL ID 83605'),
    { city: 'Caldwell', zip: '83605' },
  );
});

test('addressPatchFromSitus returns null when nothing is missing', () => {
  const client = { address: '1115 Albany St', city: 'Caldwell', state: 'ID', zip: '83605' };
  assert.strictEqual(addressPatchFromSitus(client, '1115 ALBANY ST CALDWELL ID 83605'), null);
});

test('addressPatchFromSitus refuses a non-confident (unanchored) parse', () => {
  const client = { address: '123 Main St', city: '', state: '', zip: '' };
  assert.strictEqual(addressPatchFromSitus(client, '999 OTHER RD NAMPA ID 83651'), null);
});

test('pickStreetOnlyWinner accepts a single confident verified county', () => {
  const client = { address: '1115 Albany St', borrower1first: 'John', borrower1last: 'Smith' };
  const winner = pickStreetOnlyWinner(client, [
    { county: 'canyon', result: { ownerName: 'SMITH JOHN', situsRaw: '1115 ALBANY ST CALDWELL ID 83605' } },
    { county: 'ada', result: null },
  ]);
  assert.strictEqual(winner.county, 'canyon');
  assert.strictEqual(winner.parsed.city, 'Caldwell');
});

test('pickStreetOnlyWinner rejects when two counties both verify (ambiguous)', () => {
  const client = { address: '100 Main St', borrower1first: 'John', borrower1last: 'Smith' };
  const winner = pickStreetOnlyWinner(client, [
    { county: 'ada', result: { ownerName: 'SMITH JOHN', situsRaw: '100 MAIN ST BOISE ID 83702' } },
    { county: 'canyon', result: { ownerName: 'SMITH JOHN', situsRaw: '100 MAIN ST NAMPA ID 83651' } },
  ]);
  assert.strictEqual(winner, null);
});

test('pickStreetOnlyWinner rejects when the only hit is not a name match', () => {
  const client = { address: '1115 Albany St', borrower1first: 'John', borrower1last: 'Smith' };
  const winner = pickStreetOnlyWinner(client, [
    { county: 'canyon', result: { ownerName: 'JONES MARY', situsRaw: '1115 ALBANY ST CALDWELL ID 83605' } },
    { county: 'ada', result: null },
  ]);
  assert.strictEqual(winner, null);
});
