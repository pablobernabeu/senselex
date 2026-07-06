# Architecture

SenseLex is organised in layers, from the science outward to the transport, so that each concern can be reasoned about and replaced on its own.

## Layers

The domain layer is the innermost and has no knowledge of HTTP or the database. It holds the rating dimensions, the norm computations, the validation rules, and the error types. Everything here is pure and deterministic, which is why it is the most heavily unit tested. The same functions run on the server, in the offline client, and in any later batch re-analysis, so a norm can never be computed two different ways.

The data layer wraps the database. A single connection module opens SQLite with safe pragmas and applies the schema, and a single repository module holds every SQL statement. Because all SQL lives in one file and every statement binds its parameters, user input is never concatenated into a query, and a move to PostgreSQL changes this file alone.

The server layer turns HTTP requests into repository calls. It is split into small pieces: authentication, the cross-cutting middleware for security headers, CORS, body reading, and rate limiting, the FAIR export helpers, and the application itself, which is a routing table dispatched in order. There is no web framework, and the routing is explicit so its behaviour can be read directly.

The offline layer is a client rather than a server. It records measurements to a pluggable local store and synchronises them to the Atlas in idempotent batches. The store interface has three methods, so the same client runs against a file on the desktop and against IndexedDB in the browser.

## Request lifecycle

A request first receives the security headers and the CORS decision. A preflight is answered at once. The rate limiter is consulted next, and an exhausted client is turned away before any work is done. The URL is parsed, and the router matches the method and path. A read is served directly from the repository. A write first passes authentication, then the body is read under a size cap, then the body is validated, and only then does it reach the repository, with the outcome and the actor recorded in the audit log.

## Idempotency and the offline path

Every measurement carries a client-generated identifier that becomes its primary key. A repeated insert of the same identifier is recognised as a duplicate and counted rather than stored again. This is what makes the field workflow safe: a sync that is interrupted and retried cannot create duplicates, and the queue is cleared only after the server confirms receipt.

## Scaling path

The prototype runs as a single process against a single file, which is the right size for review and for a field laptop. The design anticipates growth. The API is stateless, since authentication is by token rather than by server session, so it scales horizontally behind a load balancer. The repository abstraction allows PostgreSQL with connection pooling in place of SQLite. The rate limiter is in-process for now and would move to a shared store such as Redis when more than one node runs. List endpoints paginate and the hot columns are indexed, so query cost stays bounded as the data grow. Read endpoints carry cache headers so a cache or content delivery network can absorb repeated reads of popular norms.

## What a production build would add

A production deployment would add PostgreSQL, a shared rate-limit and cache store, structured request logging shipped to a log service, automated database migrations, and a packaged desktop build of the field client. None of these change the domain layer or the routes, which is the point of the separation.
