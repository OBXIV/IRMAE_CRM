'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { matchOwnership } = require('../src/matchOwnership');

test('verified: exact owner match (LAST FIRST format)', () => {
  const r = matchOwnership('SMITH JOHN', 'John', 'Smith');
  assert.strictEqual(r.status, 'verified');
});

test('verified: joint owners with spouse', () => {
  const r = matchOwnership('SMITH JOHN & JANE', 'John', 'Smith');
  assert.strictEqual(r.status, 'verified');
});

test('verified: minor spelling drift tolerated', () => {
  const r = matchOwnership('STEVEN MICHAEL', 'Stephen', 'Michael');
  assert.strictEqual(r.status, 'verified');
});

test('verified: first initial only is enough with last match', () => {
  const r = matchOwnership('GUSTAFSON A', 'Adam', 'Gustafson');
  assert.strictEqual(r.status, 'verified');
});

test('trust beats borrower match', () => {
  const r = matchOwnership('SMITH FAMILY LIVING TRUST', 'John', 'Smith');
  assert.strictEqual(r.status, 'trust');
});

test('trust: revocable', () => {
  assert.strictEqual(matchOwnership('JOHN SMITH REVOCABLE TRUST', 'John', 'Smith').status, 'trust');
});

test('entity: LLC', () => {
  assert.strictEqual(matchOwnership('ACME HOLDINGS LLC', 'John', 'Smith').status, 'entity');
});

test('entity: Inc', () => {
  assert.strictEqual(matchOwnership('BOISE PROPERTIES INC', 'John', 'Smith').status, 'entity');
});

test('entity word-boundary: INCLINE is not INC', () => {
  // "INCLINE VILLAGE JOHN SMITH" should not classify as entity on INC.
  const r = matchOwnership('INCLINE SMITH JOHN', 'John', 'Smith');
  assert.notStrictEqual(r.status, 'entity');
});

test('nlor: different person', () => {
  const r = matchOwnership('JONES ROBERT', 'John', 'Smith');
  assert.strictEqual(r.status, 'nlor');
});

test('null: empty owner (failed lookup) -> indeterminate', () => {
  assert.strictEqual(matchOwnership('', 'John', 'Smith'), null);
  assert.strictEqual(matchOwnership(null, 'John', 'Smith'), null);
});

test('null: no borrower name to compare and not entity/trust', () => {
  assert.strictEqual(matchOwnership('SOME PERSON', '', ''), null);
});

test('verified survives suffix tokens like JR', () => {
  const r = matchOwnership('SMITH JOHN JR', 'John', 'Smith');
  assert.strictEqual(r.status, 'verified');
});
