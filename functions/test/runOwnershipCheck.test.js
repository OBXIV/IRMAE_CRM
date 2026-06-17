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

test('routable record backfills only missing mailing parts from situs', async () => {
  const db = createMockDb({
    c1: {
      address: '1115 Albany St',
      zip: '83605', // routes to canyon; city/state missing
      borrower1first: 'John',
      borrower1last: 'Smith',
    },
  });

  const summary = await runOwnershipCheck(db, {
    now: 1710000000000,
    logger: { info() {}, warn() {} },
    delayMs: 0,
    getProviderForCounty: () => ({
      lookupOwner: async () => ({ ownerName: 'SMITH JOHN', situsRaw: '1115 ALBANY ST CALDWELL ID 83605' }),
    }),
  });

  assert.strictEqual(summary.address_enriched, 1);
  assert.strictEqual(db.data.clients.c1.city, 'Caldwell');
  assert.strictEqual(db.data.clients.c1.state, 'ID');
  assert.strictEqual(db.data.clients.c1.zip, '83605'); // pre-existing, unchanged
  assert.strictEqual(db.data.clients.c1.addressEnrichmentStatus, 'enriched');
});

test('street-only record is resolved when exactly one county verifies', async () => {
  const db = createMockDb({
    c1: {
      address: '1115 Albany St', // no city/zip/county
      borrower1first: 'John',
      borrower1last: 'Smith',
    },
  });

  const providers = {
    ada: { lookupOwner: async () => null },
    canyon: { lookupOwner: async () => ({ ownerName: 'SMITH JOHN', situsRaw: '1115 ALBANY ST CALDWELL ID 83605' }) },
  };

  const summary = await runOwnershipCheck(db, {
    now: 1710000000000,
    logger: { info() {}, warn() {} },
    delayMs: 0,
    getProviderForCounty: (county) => providers[county] || null,
  });

  assert.strictEqual(summary.street_only_probed, 1);
  assert.strictEqual(summary.address_enriched, 1);
  assert.strictEqual(summary.updated, 1);
  assert.strictEqual(db.data.clients.c1.city, 'Caldwell');
  assert.strictEqual(db.data.clients.c1.zip, '83605');
  assert.strictEqual(db.data.clients.c1.county, 'canyon');
  assert.strictEqual(db.data.clients.c1.ownershipStatus, 'verified');
  assert.strictEqual(db.data.clients.c1.addressEnrichmentStatus, 'enriched');
});

test('street-only ambiguous match goes to needs_review without writing an address', async () => {
  const db = createMockDb({
    c1: {
      address: '100 Main St',
      borrower1first: 'John',
      borrower1last: 'Smith',
    },
  });

  const providers = {
    ada: { lookupOwner: async () => ({ ownerName: 'SMITH JOHN', situsRaw: '100 MAIN ST BOISE ID 83702' }) },
    canyon: { lookupOwner: async () => ({ ownerName: 'SMITH JOHN', situsRaw: '100 MAIN ST NAMPA ID 83651' }) },
  };

  const summary = await runOwnershipCheck(db, {
    now: 1710000000000,
    logger: { info() {}, warn() {} },
    delayMs: 0,
    getProviderForCounty: (county) => providers[county] || null,
  });

  assert.strictEqual(summary.address_needs_review, 1);
  assert.strictEqual(summary.address_enriched, 0);
  assert.strictEqual(db.data.clients.c1.addressEnrichmentStatus, 'needs_review');
  assert.strictEqual(db.data.clients.c1.city, undefined);
  assert.strictEqual(db.data.clients.c1.ownershipStatus, 'unverified');
});
