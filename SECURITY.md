# Security model

Security was a design constraint from the start rather than a later addition. The choices below explain what the prototype defends against and how, and where a production deployment must go further.

## Supply chain

The prototype has no third-party dependencies. It uses only the Node standard library. There is therefore no package tree to audit, no transitive dependency to be compromised, and nothing to install on a field machine. This is the single largest reduction in attack surface available to a project of this kind.

## Input handling

Every write is validated before it reaches the database, reference data included: languages, concepts, ratings, responses and sync batches each pass a validator in the domain layer, which rejects unknown fields, out-of-range ratings, malformed identifiers, and oversized batches. The concept catalogue matters most here, because every rating keys on it. Client-supplied identifiers must match a conservative character pattern, which keeps them safe to place in URLs, filenames, and logs and removes a class of injection and path-traversal risks. Request bodies are read under a hard size cap, so a large or slow body cannot exhaust memory.

## Database access

All SQL lives in the repository and every statement binds its parameters, so user input is never concatenated into a query, which removes SQL injection as a risk. Foreign keys are enforced, so a measurement cannot refer to a language or concept that does not exist, and that failure is reported rather than silently dropped.

## Authentication

Write endpoints require a bearer token. Tokens are never stored or compared in clear text. Each configured token is reduced to a SHA-256 digest at start-up, and an incoming token is hashed and compared digest-to-digest with a constant-time comparison, which closes the timing side channel that a naive string comparison would open. In production a missing token list is a fatal configuration error rather than an open door. Reads are public by design, since the norms are meant to be shared.

## Transport and browser protections

Responses carry a strict content security policy, along with nosniff, frame denial, a no-referrer policy, and cross-origin isolation headers. The front end uses no inline script, so the policy can stay tight. Cross-origin requests are refused unless the origin is on an explicit allow list, and the allow list is empty by default, which means same-origin only.

## Abuse resistance

A fixed-window rate limiter, keyed by client address, caps how often any one client can call the service. The prototype keeps this in process, and a multi-node deployment would back it with a shared store. Transport security itself, namely HTTPS, is expected to be terminated by a reverse proxy in front of the service, which is standard for a Node application.

## Privacy

Participants are pseudonymous. Only a client-supplied reference and coarse, non-identifying study variables are stored, and no names, contact details, or identifying free text are persisted. The reference is opaque to the service, which never learns who it belongs to, though a study that sets it from a recruitment panel identifier should treat it as pseudonymous rather than anonymous, because the panel can still resolve it.

The audit log records a keyed digest of the client address rather than the address itself. The key matters: a plain hash of an IP address is not anonymisation, because the whole IPv4 space can be hashed and matched in seconds, which leaves the digest personal data under the UK GDPR. The digest is therefore an HMAC under `SENSELEX_AUDIT_SECRET`, and when that is unset the address is not recorded at all rather than stored under a guessable hash. Set a retention period for the audit table in any real deployment; nothing expires it automatically.

## Auditability

Every write attempt, successful or refused, is recorded in a separate audit table with the route, the outcome, the hashed actor, and the hashed address. Keeping the audit trail apart from the participant data means governance questions can be answered without touching the records themselves.

## Reporting

Report a vulnerability privately through GitHub: open the Security tab of https://github.com/pablobernabeu/senselex and choose "Report a vulnerability". Please do not open a public issue for a security problem. If the button is unavailable, open an issue that asks for a private contact without describing the problem. Reports are handled under coordinated disclosure: the fix is published before the details are. A deployment run by someone else should name its own monitored contact for its users.

## What a study link exposes

A study link may carry an Atlas address and a write token so that a browser session submits as it goes. Every participant can read that token from the address bar. It is therefore a low-trust credential: scope one token per study, expect it to become public, and revoke it when the study closes. It permits writes to the Atlas, not reads of anyone else's data, and the idempotent primary key limits what a replay can achieve.
