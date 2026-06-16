'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { runOwnershipCheck } = require('../src/runOwnershipCheck');

function createMockDb(initialClients) {
  const data = {
    clients: JSON.parse(JSON.stringify(initialClients || {})),
  };
  const updates = [];

  return {
    data,
    updates,
    ref(path) {
      return {
        once: async (event) => {
          assert.strictEqual(event, 'value');
          assert.strictEqual(path, 'clients');
          return { val: () => data.clients };
        },
        update: async (patch) => {
          updates.push({ path, patch });
          const parts = path.split('/');
          assert.strictEqual(parts[0], 'clients');
          const id = parts[1];
          data.clients[id] = { ...(data.clients[id] || {}), ...patch };
        },
      };
    },
  };
}

test('unsupported county is flagged and missing status defaults to unverified', async () => {
  const db = createMockDb({
    c1: {
      address: '123 Main St',
      city: 'Twin Falls',
      zip: '83301',
      borrower1first: 'Jane',
      borrower1last: 'Doe',
    },
  });

  const summary = await runOwnershipCheck(db, {
    now: 1710000000000,
    logger: { info() {}, warn() {} },
    delayMs: 0,
  });

  assert.strictEqual(summary.looked_up, 0);
  assert.strictEqual(summary.unsupported_county, 1);
  assert.deepStrictEqual(db.updates, [{
    path: 'clients/c1',
    patch: {
      ownershipStatus: 'unverified',
      ownershipCheckStatus: 'unsupported_county',
      ownershipSupportedCounty: false,
      ownershipLastAttemptAt: 1710000000000,
      ownershipLastError: 'unsupported_county',
    },
  }]);
});

test('unsupported county does not overwrite existing good statuses', async () => {
  const cases = ['verified', 'trust', 'entity', 'nlor'];

  for (const status of cases) {
    const db = createMockDb({
      c1: {
        address: '123 Main St',
        city: 'Twin Falls',
        zip: '83301',
        ownershipStatus: status,
      },
    });

    await runOwnershipCheck(db, {
      now: 1710000000000,
      logger: { info() {}, warn() {} },
      delayMs: 0,
    });

    assert.strictEqual(db.data.clients.c1.ownershipStatus, status);
    assert.strictEqual(db.data.clients.c1.ownershipCheckStatus, 'unsupported_county');
    assert.strictEqual(db.data.clients.c1.ownershipSupportedCounty, false);
    assert.ok(!Object.hasOwn(db.updates[0].patch, 'ownershipStatus'));
  }
});

test('supported lookup writes checked status on confident result', async () => {
  const db = createMockDb({
    c1: {
      address: '123 W State St',
      city: 'Boise',
      borrower1first: 'John',
      borrower1last: 'Smith',
    },
  });

  const summary = await runOwnershipCheck(db, {
    now: 1710000000000,
    logger: { info() {}, warn() {} },
    delayMs: 0,
    getProviderForCounty: () => ({
      lookupOwner: async () => ({ ownerName: 'SMITH JOHN' }),
    }),
  });

  assert.strictEqual(summary.looked_up, 1);
  assert.strictEqual(summary.updated, 1);
  assert.strictEqual(db.data.clients.c1.ownershipStatus, 'verified');
  assert.strictEqual(db.data.clients.c1.ownershipCheckStatus, 'checked');
  assert.strictEqual(db.data.clients.c1.ownershipSupportedCounty, true);
});
