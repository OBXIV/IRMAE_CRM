'use strict';

const { REQUEST_TIMEOUT_MS, USER_AGENT } = require('../config');

// Thin fetch wrapper: browser-like headers, hard timeout, text body.
// Throws on network error / non-2xx so callers can treat it as "lookup failed"
// (which means: leave the existing ownership status untouched).
async function httpGet(url, extraHeaders = {}, extraOpts = {}) {
  return request(url, { method: 'GET', headers: extraHeaders, ...extraOpts });
}

async function httpPostForm(url, formBody, extraHeaders = {}, extraOpts = {}) {
  return request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...extraHeaders,
    },
    body: typeof formBody === 'string'
      ? formBody
      : new URLSearchParams(formBody).toString(),
    ...extraOpts,
  });
}

async function request(url, opts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const {
    headers = {},
    redirect = 'follow',
    allowStatuses = [],
    ...fetchOpts
  } = opts;
  try {
    const res = await fetch(url, {
      ...fetchOpts,
      redirect,
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...headers,
      },
    });
    const text = await res.text();
    if (!res.ok && !allowStatuses.includes(res.status)) {
      const err = new Error(`HTTP ${res.status} for ${url}`);
      err.status = res.status;
      err.body = text;
      throw err;
    }
    return { status: res.status, text, headers: res.headers, url: res.url };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { httpGet, httpPostForm };
