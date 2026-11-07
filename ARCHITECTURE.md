# Architecture

SenseLex is organised in layers, from the domain logic outward to the HTTP transport, so that each concern can be reasoned about and replaced on its own.

## Layers

The domain layer is the innermost and does not depend on HTTP or the database. It holds the rating dimensions, the norm computations, the validation rules and the error types. Because everything in it is pure and deterministic, it is the most heavily unit-tested layer. The same functions run on the server, in the offline client and in any later batch re-analysis, so a norm can never be computed two different ways.

The data layer wraps the database. A single connection module opens SQLite with safe pragmas and applies the schema, and a single repository module holds every SQL statement. Because every statement binds its parameters, user input is never concatenated into a query. Apart from one change to the callers of the repository, a move to PostgreSQL is confined to the data layer (the repository, the connection module and the schema). The repository is synchronous, like Node's SQLite driver, so an asynchronous PostgreSQL driver would make its callers (the routes and the seed loader) await it.

The server layer turns HTTP requests into repository calls. It is split into small pieces: authentication, the cross-cutting middleware (security headers, CORS, body reading and rate limiting), the FAIR export helpers and the application itself, which is a routing table dispatched in order. There is no web framework, and the routing is explicit, so its behaviour can be read directly from the code.

The offline layer is a client that records measurements to a pluggable local store and synchronises them to the Atlas in idempotent batches. A queue larger than one batch is sent in slices, so a device that has been offline for a long time can still empty its queue. The store interface has three methods, so the same client can run against a file on the desktop and against IndexedDB in the browser. Only the in-memory reference store is implemented so far. The browser edition keeps its own records in localStorage without using this layer, and the packaged desktop build exists only as a documented sketch.

## Request lifecycle

A request first receives the security headers and the CORS decision, and a preflight is answered at once. The rate limiter is consulted next, and a client that has used up its allowance is rejected before any work is done. The URL is parsed, and the router matches the method and path. A read is served directly from the repository. A write first passes authentication, and once admin tokens are configured, a write to the language or concept routes must also carry an admin token. The body of the write is then read under a size cap and validated before it reaches the repository, and the outcome and the actor are recorded in the audit log.

## Idempotency and the offline path

Every measurement carries a client-generated identifier that becomes its primary key. A repeated insert of the same identifier is recognised as a duplicate and counted without being stored again. A sync that is interrupted and retried therefore cannot create duplicates. Each slice of the queue is cleared only after the server confirms that slice, so an interruption partway through keeps the progress already acknowledged and leaves the rest queued.

## Scaling path

The prototype runs as a single process against a single file, which suits review and use on a field laptop. The design allows for growth beyond that. Authentication is by token, with no server session, so the API is stateless and scales horizontally behind a load balancer. The repository abstraction allows PostgreSQL with connection pooling in place of SQLite. The rate limiter is in-process for now and would move to a shared store such as Redis when more than one node runs. List endpoints paginate and the most frequently queried columns are indexed, so query cost stays bounded as the data grow. The two norms endpoints (`/v1/norms/sensorimotor` and `/v1/norms/codability`) carry a one-minute public cache header (`Cache-Control: public, max-age=60`), so a cache or content delivery network can answer repeated reads of popular norms. The other reads, the exports included, carry none.

## What a production build would add

A production deployment would add PostgreSQL, a shared rate-limit and cache store, structured request logging sent to a log service, automated database migrations and a packaged desktop build of the field client. None of these change the domain layer.
