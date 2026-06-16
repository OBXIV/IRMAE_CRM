'use strict';

const { normalizeName, tokenize, anyTokenMatches } = require('./nameUtils');

// Word-boundary patterns so "INCLINE" is not read as "INC", etc.
const TRUST_RE = /\b(TRUST|TRUSTEE|TRUSTEES|REVOCABLE|IRREVOCABLE|LIVING TRUST|FAMILY TRUST)\b/;
const ENTITY_RE = /\b(LLC|L L C|INC|INCORPORATED|CORP|CORPORATION|HOLDINGS|LP|LLP|COMPANY|ENTERPRISES|PROPERTIES|INVESTMENTS|PARTNERS)\b/;

/**
 * Classify an assessor owner name against the loan's primary borrower.
 *
 * Returns one of:
 *   { status: 'trust'|'entity'|'verified'|'nlor', ownerName }  -> a confident result
 *   null                                                        -> indeterminate; caller must NOT overwrite existing status
 *
 * Order matters: trust/entity are checked before the borrower match so that
 * "SMITH FAMILY TRUST" classifies as trust, not verified.
 */
function matchOwnership(ownerNameRaw, borrowerFirst, borrowerLast) {
  const ownerName = ownerNameRaw ? String(ownerNameRaw).trim() : '';
  if (!ownerName) return null; // no owner returned == failed lookup

  const norm = normalizeName(ownerName);
  if (!norm) return null;

  if (TRUST_RE.test(norm)) return { status: 'trust', ownerName };
  if (ENTITY_RE.test(norm)) return { status: 'entity', ownerName };

  const first = normalizeName(borrowerFirst);
  const last = normalizeName(borrowerLast);

  // With no borrower name to compare against we cannot distinguish a real
  // owner change from a data gap, so stay indeterminate (fail-safe).
  if (!last && !first) return null;

  const ownerTokens = tokenize(ownerName);
  const lastOk = last ? anyTokenMatches(ownerTokens, last) : false;
  const firstOk = first ? anyTokenMatches(ownerTokens, first) : false;
  const firstInitialOk =
    first && first.length > 0
      ? ownerTokens.some((t) => t[0] === first[0])
      : false;

  // Strongest signal is the last name. Require it, plus first name or initial.
  if (last && lastOk && (firstOk || firstInitialOk || !first)) {
    return { status: 'verified', ownerName };
  }
  // Last name missing from record but a full first-name match is present.
  if (!last && first && firstOk) {
    return { status: 'verified', ownerName };
  }

  // Owner is a real person but not our borrower.
  return { status: 'nlor', ownerName };
}

module.exports = { matchOwnership, TRUST_RE, ENTITY_RE };
