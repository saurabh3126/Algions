# RouteRelay Bus Booking Management System Technical Report

## Project objective

RouteRelay is a responsive, database-backed bus booking application for customers, operators and administrators. It implements the complete customer journey from trip search to confirmed ticket, while preserving seat integrity under simultaneous requests. Its distinguishing workflow helps an operator recover a disrupted trip by assigning a safe replacement bus without changing confirmed passenger PNRs.

## Architecture

The application is a modular monolith. A browser frontend calls an Express HTTP API. Request handlers perform schema validation and role checks before invoking transactional booking services. MongoDB stores operational records and provides unique indexes and multi-document transactions. This keeps deployment simple while separating presentation, HTTP concerns, business rules and persistence.

The frontend uses plain HTML, CSS and JavaScript and is served by Express. This avoids a separate build tool while supporting responsive customer, operator and admin interfaces. The backend is divided into `app.js` for HTTP and authorization, `bookings.js` for transactional workflows, `domain.js` for validation and policies, `security.js` for passwords and tokens, and `db.js` for connections, collections and indexes.

## Data model

Operators own buses and employ operator users. Each bus embeds a unique seat layout. Routes embed an ordered list of stops. A trip snapshots its route name, stops, bus seats, schedule, fare and cancellation policy so later master-data edits do not silently change an existing service. A booking snapshots passenger, journey, seat, fare and cancellation terms and stores status and replacement history. Sessions store hashed bearer tokens with automatic expiry. Audit records capture material business actions.

The important indexes are unique user email, bus registration, PNR, customer idempotency key and the partial unique `(tripId, seat)` index for confirmed bookings. Trip schedule and audit indexes support relevant queries.

## Authentication and authorization

Passwords are salted and hashed with scrypt. Login creates a random bearer token; only its SHA-256 digest is stored. Sessions expire after eight hours and can be revoked at logout. Registration always creates a customer. Admin and operator accounts are provisioned by an admin or the local seed process.

Every protected endpoint authenticates the session on the server. Role middleware and operator ownership checks protect setup, reports and recovery workflows. The frontend hides inaccessible navigation for usability, but security does not depend on hidden buttons.

## Search and booking workflow

Customers search future trips by origin, destination and travel date. The server verifies that both stops exist and that the destination follows the origin. Results show schedule, duration, fare and current available-seat count. The seat map reads current confirmed bookings.

Booking requires a customer session and an idempotency key. Inside a MongoDB transaction, the server reloads the trip, validates status, time, seat and stop order, increments the trip revision and inserts a confirmed booking with a unique PNR. The partial unique seat index is the final protection against simultaneous confirmation of the same trip seat. Repeating the same request key returns the original ticket; changing the request body under the same key returns a conflict.

## Cancellation and refunds

Each booking captures the trip's cancellation cutoff and refund percentage at confirmation. This prevents a later policy edit from changing an existing ticket's terms. Cancellation checks the saved cutoff inside a transaction, changes the ticket status, records a simulated refund in integer INR paise and writes an audit event. Because only confirmed bookings occupy the partial unique seat index, cancellation immediately releases the seat while preserving booking history.

## Disruption recovery

An operator can mark a future scheduled trip as disrupted and record the reason. Replacement preview checks ownership, schedule overlap and exact seat-label compatibility and returns the current trip revision. Confirmation requires that preview revision; stale previews fail safely. A successful transaction assigns the new bus, returns the trip to scheduled status and appends the bus change to every confirmed ticket without changing PNR or seat.

Smaller or differently labelled buses are deliberately sent for manual attention. This avoids silently moving or dropping passengers and keeps the two-day MVP explainable.

## Reporting and audit

The operator workspace provides schedules, occupancy, confirmed fare total, simulated refunds and passenger manifests. Manifests can be exported as CSV. Operators can adjust the fare and cancellation policy for future bookings. The audit view lists booking, cancellation, disruption, policy and replacement events. Admin screens manage operators, buses and seat layouts, ordered routes, trip schedules and staff accounts.

## Validation and reliability

Zod schemas validate request bodies and identifiers. APIs return predictable 400, 401, 403, 404 and 409 responses. Booking, cancellation, scheduling and replacement use MongoDB transactions. Unique indexes protect identity, PNR, idempotency and seat integrity. Health and readiness endpoints distinguish process availability from database connectivity.

The automated suite includes focused unit tests and real HTTP/MongoDB integration tests. It covers stop order, refund calculation, cutoff rejection, authorization, duplicate layouts, privilege protection, token revocation, simultaneous seat contention, idempotency, cancellation, invalid input, overlapping schedules, replacement safety, stale preview rejection, PNR preservation and report reconciliation.

## Responsible data handling

Seed data and demo accounts are synthetic. The system does not require real payment details or sensitive identity documents. Passwords and tokens are not logged. `.env` is ignored and an example file documents required settings. The demo password must be changed before public deployment.

## Limitations

- One passenger and one seat per booking.
- A seat is reserved for the entire trip rather than independently for route segments.
- Flat trip fare; intermediate-stop pricing and stop-specific times are not modelled.
- Refunds are simulated and no payment gateway is connected.
- Automatic replacement supports future trips and identical seat labels only.
- No SMS, email, GPS or live vehicle tracking.
- Local deployment is supplied; production hosting, TLS, backups and centralized rate limiting remain deployment work.

## Future improvements

The next version could support group bookings, segment-based inventory, boarding-point times and prices, manual seat remapping, notifications, payment/refund providers and production observability. These features should be added only after preserving the transaction and audit guarantees demonstrated by the current system.

## AI and attribution

OpenAI Codex assisted with planning, implementation, test generation, documentation and interface review. The candidate remains responsible for reviewing, understanding and explaining the source. MongoDB, Express, Zod, Helmet, CORS and express-rate-limit are used under their respective open-source licenses. No restricted dataset or personal customer data is included.
