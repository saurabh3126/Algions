# Backend verification

Verified on 12 November 2026 using Node.js 24.9.0 and local MongoDB 8.3 in a single-node replica set.

`npm test`: 13 tests passed, 0 failed: 5 focused unit tests and 8 HTTP/MongoDB integration scenarios. Each integration run uses a newly generated test database and removes it afterward.

- Registration cannot elevate privileges; login and token revocation work.
- Concurrent requests for one seat confirm exactly one ticket; cancellation releases the seat and calculates the refund.
- Invalid seats/stops and unauthorized access are rejected.
- Search returns available seats, reversed journeys are excluded and overlapping bus schedules are rejected.
- Concurrent requests with the same idempotency key return the same PNR; changed payloads are rejected.
- Smaller replacement layouts and stale previews are rejected; accepted replacements retain PNRs and reconcile reports.
- Cancellation cutoff and cross-operator isolation are enforced.
- Admin setup, trip policy, audit history and API documentation work end to end.

`npm audit --omit=dev --audit-level=high`: 0 vulnerabilities reported at verification time.

Demo seeding completed successfully. The local responsive frontend covers search, seat selection, booking, ticket history, cancellation, operator manifests, reporting, policy controls, audit history, disruption recovery and complete admin setup. Public hosting and real payment integration are outside the current stage. See README for other scope limits.
