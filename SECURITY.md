# Security model

Security was a design constraint from the start rather than a later addition. The choices below explain what the prototype defends against and how, and where a production deployment must go further.

## Supply chain

The prototype has no third-party dependencies. It uses only the Node standard library. There is therefore no package tree to audit, no transitive dependency to be compromised, and nothing to install on a field machine. This is the single largest reduction in attack surface available to a project of this kind.

## Input handling

Every write is validated before it reaches the database. Validation is centralised in the domain layer and rejects unknown fields, out-of-range ratings, malformed identifiers, and oversized batches. Client-supplied identifiers must match a conservative character pattern, which keeps them safe to place in URLs, filenames, and logs and removes a class of injection and path-traversal risks. Request bodies are read under a hard size cap, so a large or slow body cannot exhaust memory.

## Database access

All SQL lives in the repository and every statement binds its parameters, so user input is never concatenated into a query and injection is structurally impossible. Foreign keys are enforced, so a measurement cannot refer to a language or concept that does not exist, and that failure is reported rather than silently dropped.

## Authentication

Write endpoints require a bearer token. Tokens are never stored or compared in clear text. Each configured token is reduced to a SHA-256 digest at start-up, and an incoming token is hashed and compared digest-to-digest with a constant-time comparison, which closes the timing side channel that a naive string comparison would open. In production a missing token list is a fatal configuration error rather than an open door. Reads are public by design, since the norms are meant to be shared.

## Transport and browser protections

Responses carry a strict content security policy, along with nosniff, frame denial, a no-referrer policy, and cross-origin isolation headers. The front end uses no inline script, so the policy can stay tight. Cross-origin requests are refused unless the origin is on an explicit allow list, and the allow list is empty by default, which means same-origin only.

## Abuse resistance

A fixed-window rate limiter, keyed by client address, caps how often any one client can call the service. The prototype keeps this in process, and a multi-node deployment would back it with a shared store. Transport security itself, namely HTTPS, is expected to be terminated by a reverse proxy in front of the service, which is standard for a Node application.

## Privacy

Participants are pseudonymous. Only a hashed reference and coarse, non-identifying study variables are stored, and no names, contact details, or identifying free text are persisted. The audit log records a hash of the client address rather than the address itself, so that abuse can be investigated without retaining personal data. These choices match the consent and data-protection commitments in the research proposal and the requirements of the funders.

## Auditability

Every write attempt, successful or refused, is recorded in a separate audit table with the route, the outcome, the hashed actor, and the hashed address. Keeping the audit trail apart from the participant data means governance questions can be answered without touching the records themselves.

## Reporting

For a real deployment, security reports should go to a monitored address and be handled under a coordinated disclosure policy. Add that address here before publishing the repository.
