// Bearer-token authentication for write endpoints. Tokens are never stored or
// compared in clear text: each configured token is reduced to a SHA-256 digest
// at startup, and an incoming token is hashed and compared digest-to-digest with
// a constant-time comparison, which removes the timing side channel that a naive
// string compare would leak. A short, non-reversible token id is kept only so
// that the audit log can attribute a write without recording the secret.
//
// There are two kinds of token. A write token may submit measurements, and an
// admin token may also change reference data. The kind travels with a match, so
// that the application decides route by route what a token may do.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function createAuthenticator(writeTokens, adminTokens = []) {
  // Keyed by digest, so a token listed as both kinds is held once. Admin tokens
  // are added last, so such a token ends up as an admin token, and its id is
  // kept so that start-up can warn that it must not go in a study link.
  const byDigest = new Map();
  const sharedTokenIds = new Set();
  for (const [tokens, admin] of [[writeTokens, false], [adminTokens, true]]) {
    for (const token of tokens) {
      const digest = sha256(token);
      const hex = digest.toString('hex');
      const tokenId = hex.slice(0, 8);
      if (admin && byDigest.get(hex)?.admin === false) sharedTokenIds.add(tokenId);
      byDigest.set(hex, { digest, tokenId, admin });
    }
  }
  const allowed = [...byDigest.values()];
  const adminConfigured = allowed.some((entry) => entry.admin);
  const writeOnlyConfigured = allowed.some((entry) => !entry.admin);

  return {
    // Returns { ok, tokenId, admin } without revealing which token matched on
    // failure.
    verify(authorizationHeader) {
      if (typeof authorizationHeader !== 'string') return { ok: false };
      const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
      if (!match) return { ok: false };
      const candidate = sha256(match[1]);
      for (const entry of allowed) {
        if (candidate.length === entry.digest.length && timingSafeEqual(candidate, entry.digest)) {
          return { ok: true, tokenId: entry.tokenId, admin: entry.admin };
        }
      }
      return { ok: false };
    },
    // True when any token of either kind is set.
    get configured() {
      return allowed.length > 0;
    },
    // True when admin tokens are set, which restricts reference data to them.
    get adminConfigured() {
      return adminConfigured;
    },
    // True when some write token is not also an admin token, so that a study
    // can be given a token that cannot change reference data.
    get writeOnlyConfigured() {
      return writeOnlyConfigured;
    },
    // The ids of the tokens listed as both kinds, which act as admin tokens.
    get sharedTokenIds() {
      return [...sharedTokenIds];
    },
  };
}

// The audit log stores a keyed digest of the client address rather than the
// address itself, so that repeat abuse from one source can be recognised without
// keeping the address.
//
// The key matters. A plain SHA-256 of an IP address is not anonymisation: IPv4
// has only 2^32 addresses, so the whole space can be hashed and matched in
// seconds, and the digest therefore remains personal data under the UK GDPR. An
// HMAC under a secret the attacker does not hold blocks that, which makes the
// digest pseudonymous rather than merely obscured.
//
// When no key is configured the address is dropped altogether rather than stored
// under a guessable digest. That loses the ability to correlate abuse, which is
// the safer way to fail.
export function createAddressDigest(secret) {
  if (!secret) return () => null;
  return (ip) => {
    if (!ip) return null;
    return createHmac('sha256', secret).update(String(ip), 'utf8').digest('hex').slice(0, 16);
  };
}
