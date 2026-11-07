# Security model

Security was a design constraint from the start. The sections below describe what the prototype defends against and how, and where a production deployment must go further.

## Supply chain

The prototype has no third-party dependencies and uses only the Node standard library. There is therefore no package tree to audit, no transitive dependency to be compromised and nothing to install on a field machine. This is the single largest reduction in attack surface available to a project of this kind.

## Input handling

Every write is validated before it reaches the database, reference data included. Languages, concepts, ratings, responses and sync batches each pass a validator in the domain layer. These validators reject missing, malformed or over-long fields, unknown rating dimensions, out-of-range ratings and oversized batches, and they drop any other field they do not recognise. The concept catalogue matters most here, because every rating keys on it. Client-supplied identifiers must match a conservative character pattern, which keeps them safe to place in URLs, filenames and logs and removes a class of injection and path-traversal risks. Request bodies are read under a hard size cap, so a large or slow body cannot exhaust memory.

## Database access

All SQL is in the repository, and every statement binds its parameters, so user input is never concatenated into a query. This removes SQL injection as a risk. Foreign keys are enforced, so a measurement cannot refer to a language or concept that does not exist. A write that names such a language or concept is reported as a failure rather than silently dropped.

## Authentication

Write endpoints require a bearer token. Tokens are never stored or compared in clear text. Each configured token is reduced to a SHA-256 digest at start-up. An incoming token is hashed and compared digest-to-digest with a constant-time comparison, which avoids the timing side channel of a naive string comparison. In production, a missing list of write tokens is a fatal configuration error. Reads are public, because the norms are meant to be shared.

Tokens come in two kinds. Write tokens, listed in `SENSELEX_API_TOKENS`, submit measurements through `POST /v1/ratings`, `POST /v1/responses` and `POST /v1/sync`. Admin tokens, listed in `SENSELEX_ADMIN_TOKENS`, can do the same and can also create and overwrite reference data through `POST /v1/languages` and `POST /v1/concepts`. Reference data is what every measurement keys on and what the exports and their metadata describe. A measurement cannot create or change a language or concept, because it can only name one that already exists.

A token listed in both variables is an admin token. When `SENSELEX_ADMIN_TOKENS` is set, the two reference-data routes accept only admin tokens, and a write token sent to them is rejected with `403`. When it is unset, any write token can call every write route. In development, admin tokens may be set alone, and every write then needs one of them. `SENSELEX_API_TOKENS` remains required in production even when admin tokens are set, because admin tokens are meant to stay with whoever maintains the reference data. The requirement gives a deployment a non-admin token to hand out, as long as at least one write token is not also listed as an admin token.

When `NODE_ENV` is `production`, as in the Docker image, `senselex serve` writes a warning to stderr at start-up if `SENSELEX_ADMIN_TOKENS` is unset. It also warns when a token is listed in both variables, naming it only by its short identifier, and gives a stronger warning when no other write token is left. A server embedded through `createServer`, such as the local Atlas in the desktop sketch (`desktop/main.js`), writes neither warning.

## Transport and browser protections

Responses carry a strict content security policy, along with nosniff, frame denial, a no-referrer policy, a same-origin opener policy, a same-origin resource policy and a permissions policy that denies geolocation, microphone and camera. The front end uses no inline script, so the policy can stay strict.

Responses carry CORS headers only for origins on an allow list (`SENSELEX_CORS_ORIGINS`), which is empty by default. With the list empty, a browser lets only same-origin pages read API responses or send authenticated writes, because a write's Authorization header needs a preflight that other origins fail. The server does not reject other origins itself. A cross-site simple request, such as a form or `text/plain` POST, still reaches it and is processed. That is one more reason to set `SENSELEX_API_TOKENS` on any server reachable from a browser.

## Abuse resistance

A fixed-window rate limiter, keyed by client address, caps how often any one client can call the service. The prototype keeps this in process, and a multi-node deployment would back it with a shared store. HTTPS is expected to be terminated by a reverse proxy in front of the service. The limiter and the audit log's address digest both key on the socket address (`clientAddress` in `src/server/middleware.js`) and trust no forwarded header. Behind a reverse proxy, every request therefore arrives from the proxy's address, so all clients share one allowance of `SENSELEX_RATE_MAX` requests per `SENSELEX_RATE_WINDOW_MS` (240 a minute by default) and one address digest. Raise the limit, or adapt `clientAddress` to read the header your proxy sets, trusting it only on requests from that proxy's address.

## Privacy

Participants are pseudonymous. Only a client-supplied reference and coarse, non-identifying study variables are stored, and no names, contact details or identifying free text are persisted. The reference is opaque to the service, which has no information about who it belongs to. A study that sets it from a recruitment panel identifier should still treat it as pseudonymous rather than anonymous, because the panel can resolve it.

The audit log stores the client address only as a keyed digest. A plain hash of an IP address is not anonymisation, because the whole IPv4 space can be hashed and matched in seconds, and such a hash remains personal data under the UK GDPR. The digest is therefore an HMAC under `SENSELEX_AUDIT_SECRET`, and when that is unset, the address is not recorded at all. Nothing deletes audit entries automatically, so set a retention period for the audit table in any production deployment.

## Auditability

Write attempts are recorded in a separate audit table with the route, the status and any detail. Keeping the audit trail apart from the participant data means governance questions can be answered without accessing that data. The table records every attempt rejected for lack of a valid token (status 401, detail `auth-failed`), every attempt to write a language or concept with a write token while admin tokens are set (status 403, detail `admin-required`) and every write that passes validation, whether it is stored or rejected for naming a language or concept that the Atlas does not hold. These entries also carry the keyed digest of the client address when `SENSELEX_AUDIT_SECRET` is set, and an entry for a valid token, the `403` rejections included, carries the token's short identifier. Unhandled server errors on any route are recorded too, with the action `error`.

A request rejected by the rate limiter leaves no entry. With tokens of either kind configured, neither does a write rejected for an oversized or malformed body or a failed validation. With no tokens of either kind configured, every write attempt that passes the rate limiter is recorded, without its address, as an unauthenticated development write. The table is an ordinary one, so anyone who can write to the database file can change it.

## Reporting

Report a vulnerability privately through GitHub. Open the Security tab of https://github.com/pablobernabeu/senselex and choose 'Report a vulnerability'. Please do not open a public issue for a security problem. If the button is unavailable, open an issue that asks for a private contact without describing the problem. Reports are handled under coordinated disclosure, in which the fix is published before the details are. A deployment run by someone else should name its own monitored contact for its users.

## What a study link exposes

A study link may carry an Atlas address and a write token so that a browser session submits as it goes. Every participant can read that token from the address bar. It is therefore a low-trust credential, and you should expect it to become public. Without `SENSELEX_ADMIN_TOKENS`, any token in `SENSELEX_API_TOKENS` can call every write route, including the language and concept routes, which overwrite an existing entry. Whoever copies a study-link token can then alter reference data as well as submit measurements. The token allows no read that the public routes do not already allow, and the idempotent primary key limits what a replay of a measurement can achieve.

Set `SENSELEX_ADMIN_TOKENS` on any Atlas that a study link points to, and create the study's languages and concepts with an admin token. The language and concept routes then reject a write token. A copied study-link token can still submit measurements, which enter the norms like any others, but it can no longer change reference data. Never put an admin token in a link, and keep the link's token out of `SENSELEX_ADMIN_TOKENS`, since a token listed in both variables is an admin token. Issue a separate write token for each study, so that the audit log attributes its writes and it can be revoked on its own. When the study closes, revoke it by removing it from `SENSELEX_API_TOKENS` and restarting the service, which reads both variables at start-up.
