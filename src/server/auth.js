// Bearer-token authentication for write endpoints. Tokens are never stored or
// compared in clear text: each configured token is reduced to a SHA-256 digest
// at startup, and an incoming token is hashed and compared digest-to-digest with
// a constant-time comparison, which removes the timing side channel that a naive
// string compare would leak. A short, non-reversible token id is kept only so
// that the audit log can attribute a write without recording the secret.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function createAuthenticator(writeTokens) {
  const allowed = writeTokens.map((token) => {
    const digest = sha256(token);
    return { digest, tokenId: digest.toString('hex').slice(0, 8) };
  });

  return {
    // Returns { ok, tokenId } without revealing which token matched on failure.
    verify(authorizationHeader) {
      if (typeof authorizationHeader !== 'string') return { ok: false };
      const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
      if (!match) return { ok: false };
      const candidate = sha256(match[1]);
      for (const entry of allowed) {
        if (candidate.length === entry.digest.length && timingSafeEqual(candidate, entry.digest)) {
          return { ok: true, tokenId: entry.tokenId };
        }
      }
      return { ok: false };
    },
    get configured() {
      return allowed.length > 0;
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
