'use strict';

// Strip everything to a comparable shape: uppercase, drop punctuation
// (keep & since assessors use "JOHN & JANE"), collapse whitespace.
function normalizeName(s) {
  if (!s) return '';
  return String(s)
    .toUpperCase()
    .replace(/[^A-Z0-9& ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Suffixes / connectors that should never count as a name token when matching.
// Note: single letters (A, V) are deliberately NOT here — a trailing "A" in an
// owner name is a first/middle initial, not an article, and we match on it.
const STOP_TOKENS = new Set([
  'JR', 'SR', 'II', 'III', 'IV', 'AND', 'OR', 'ET', 'AL', 'ETAL',
  'MR', 'MRS', 'MS', 'DR', 'THE', '&',
]);

function tokenize(name) {
  return normalizeName(name)
    .split(' ')
    .filter((t) => t && !STOP_TOKENS.has(t));
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const m = a.length;
  const n = b.length;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// Tolerant single-token compare: exact, or within an edit distance that
// scales with token length (handles "STEPHEN" vs "STEVEN", OCR typos).
function tokenMatches(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const longer = Math.max(a.length, b.length);
  if (longer <= 3) return false; // too short to fuzzy safely
  const allowed = longer >= 7 ? 2 : 1;
  return levenshtein(a, b) <= allowed;
}

// Does any token in the owner name match the target token?
function anyTokenMatches(ownerTokens, target) {
  return ownerTokens.some((t) => tokenMatches(t, target));
}

module.exports = {
  normalizeName,
  tokenize,
  levenshtein,
  tokenMatches,
  anyTokenMatches,
};
