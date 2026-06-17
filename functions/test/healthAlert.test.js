'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { detectBrokenProviders, buildAlertMessage, postAlertWebhook } = require('../src/healthAlert');

test('detectBrokenProviders flags a provider with zero owners over the sample', () => {
  const broken = detectBrokenProviders({ ada: { attempts: 8, owners: 0, errors: 3 } }, 5);
  assert.strictEqual(broken.length, 1);
  assert.strictEqual(broken[0].county, 'ada');
  assert.match(broken[0].detail, /0\/8/);
});

test('detectBrokenProviders ignores a healthy provider', () => {
  assert.deepStrictEqual(detectBrokenProviders({ ada: { attempts: 8, owners: 6, errors: 1 } }, 5), []);
});

test('detectBrokenProviders ignores a small sample (quiet night, no false alarm)', () => {
  assert.deepStrictEqual(detectBrokenProviders({ canyon: { attempts: 3, owners: 0, errors: 0 } }, 5), []);
});

test('buildAlertMessage is human-readable and names the county', () => {
  const msg = buildAlertMessage([{ county: 'canyon', attempts: 12, errors: 0, detail: 'canyon: 0/12 lookups returned an owner' }], 1710000000000);
  assert.match(msg, /canyon: 0\/12/);
  assert.match(msg, /changed its site/);
});

test('postAlertWebhook posts JSON and reports delivery', async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true }; };
  const ok = await postAlertWebhook('https://hooks.example/x', 'hello', fakeFetch);
  assert.strictEqual(ok, true);
  assert.strictEqual(calls[0].url, 'https://hooks.example/x');
  assert.deepStrictEqual(JSON.parse(calls[0].opts.body), { text: 'hello' });
});

test('postAlertWebhook returns false (never throws) on a failing webhook', async () => {
  const fakeFetch = async () => { throw new Error('network down'); };
  assert.strictEqual(await postAlertWebhook('https://hooks.example/x', 'hi', fakeFetch), false);
});

test('postAlertWebhook is a no-op without a url', async () => {
  assert.strictEqual(await postAlertWebhook('', 'hi', async () => ({ ok: true })), false);
});
