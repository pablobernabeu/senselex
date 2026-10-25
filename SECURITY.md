# Security model

Security was a design constraint from the start rather than a later addition. The choices below explain what the prototype defends against and how, and where a production deployment must go further.

## Supply chain

The prototype has no third-party dependencies. It uses only the Node standard library. There is therefore no package tree to audit, no transitive dependency to be compromised, and nothing to install on a field machine. This is the single largest reduction in attack surface available to a project of this kind.

## Input handling

Every write is validated before it reaches the database, reference data included: languages, concepts, ratings, responses and sync batches each pass a validator in the domain layer, which rejects missing, malformed or over-long fields, unknown rating dimensions, out-of-range ratings and oversized batches, and drops any other field it does not recognise rather than storing it. The concept catalogue matters most here, because every rating keys on it. Client-supplied identifiers must match a conservative character pattern, which keeps them safe to place in URLs, filenames, and logs and removes a class of injection and path-traversal risks. Request bodies are read under a hard size cap, so a large or slow body cannot exhaust memory.

## Database access

All SQL lives in the repository and every statement binds its parameters, so user input is never concatenated into a query, which removes SQL injection as a risk. Foreign keys are enforced, so a measurement cannot refer to a language or concept that does not exist, and that failure is reported rather than silently dropped.

## Authentication

Write endpoints require a bearer token. Tokens are never stored or compared in clear text. Each configured token is reduced to a SHA-256 digest at start-up, and an incoming token is hashed and compared digest-to-digest with a constant-time comparison, which closes the timing side channel that a naive string comparison would open. In production a missing token list is a fatal configuration error rather than an open door. Reads are public by design, since the norms are meant to be shared.

## Transport and browser protections

Responses carry a strict content security policy, along with nosniff, frame denial, a no-referrer policy, a same-origin opener policy, a same-origin resource policy and a permissions policy that denies geolocation, microphone and camera. The front end uses no inline script, so the policy can stay tight. Responses carry CORS headers only for origins on an explicit allow list (`SENSELEX_CORS_ORIGINS`), which is empty by default. By default, then, a browser lets only same-origin pages read API responses or send authenticated writes, because a write's Authorization header needs a preflight that other origins fail. The server does not reject other origins itself: a cross-site simple request, such as a form or `text/plain` POST, still reaches it and is processed. That is one more reason to set `SENSELEX_API_TOKENS` on any server reachable from a browser.

## Abuse resistance

A fixed-window rate limiter, keyed by client address, caps how often any one client can call the service. The prototype keeps this in process, and a multi-node deployment would back it with a shared store. Transport security itself, namely HTTPS, is expected to be terminated by a reverse proxy in front of the service, which is standard for a Node application. The limiter and the audit log's address digest both key on the socket address (`clientAddress` in `src/server/middleware.js`) and trust no forwarded header. Behind a reverse proxy, every request therefore arrives from the proxy's address, so all clients share one allowance of `SENSELEX_RATE_MAX` requests per `SENSELEX_RATE_WINDOW_MS` (240 a minute by default) and one address digest. Raise the limit, or adapt `clientAddress` to read the header your proxy sets, trusting it only on requests from that proxy's address.

## Privacy

Participants are pseudonymous. Only a client-supplied reference and coarse, non-identifying study variables are stored, and no names, contact details, or identifying free text are persisted. The reference is opaque to the service, which never learns who it belongs to, though a study that sets it from a recruitment panel identifier should treat it as pseudonymous rather than anonymous, because the panel can still resolve it.

The audit log records a keyed digest of the client address rather than the address itself. The key matters: a plain hash of an IP address is not anonymisation, because the whole IPv4 space can be hashed and matched in seconds, which leaves the digest personal data under the UK GDPR. The digest is therefore an HMAC under `SENSELEX_AUDIT_SECRET`, and when that is unset the address is not recorded at all rather than stored under a guessable hash. Set a retention period for the audit table in any real deployment; nothing expires it automatically.

## Auditability

Write attempts are recorded in a separate audit table with the route, the status and any detail. The table records every attempt refused for lack of a valid token, and every write that passes validation, whether the Atlas stores it or refuses it for naming a language or concept it does not hold. These entries also carry the keyed digest of the client address when `SENSELEX_AUDIT_SECRET` is set, and an authenticated write carries the token's short identifier. A request turned away by the rate limiter leaves no entry. With tokens configured, neither does a write refused for an oversized or malformed body or a failed validation. With no tokens configured, every write attempt that passes the rate limiter is recorded, without its address, as an unauthenticated development write. Unhandled server errors on any route are recorded too, with the action `error`. The table is an ordinary one, so anyone who can write to the database file can change it. Keeping the audit trail apart from the participant data means governance questions can be answered without touching the records themselves.

## Reporting

Report a vulnerability privately through GitHub: open the Security tab of https://github.com/pablobernabeu/senselex and choose "Report a vulnerability". Please do not open a public issue for a security problem. If the button is unavailable, open an issue that asks for a private contact without describing the problem. Reports are handled under coordinated disclosure: the fix is published before the details are. A deployment run by someone else should name its own monitored contact for its users.

## What a study link exposes

A study link may carry an Atlas address and a write token so that a browser session submits as it goes. Every participant can read that token from the address bar. It is therefore a low-trust credential: expect it to become public. Tokens carry no scope, so any token in `SENSELEX_API_TOKENS` can call every write route, including the language and concept routes, which overwrite an existing entry. Whoever copies a study-link token can thus alter reference data as well as submit measurements. Issue a separate token for each study, so that the audit log attributes its writes and it can be revoked on its own. When the study closes, revoke it by removing it from `SENSELEX_API_TOKENS` and restarting the service, which reads the list at start-up. The token allows no read that the public routes do not already allow, and the idempotent primary key limits what a replay of a measurement can achieve.
