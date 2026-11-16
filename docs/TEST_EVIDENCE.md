# RouteRelay Test Evidence

Verified on 12 November 2026 with Node.js 24.9.0 and MongoDB 8.3 configured as a local replica set.

## Commands

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-mongo.ps1
npm test
npm audit --omit=dev --audit-level=high
```

## Result

- 14 tests passed
- 0 tests failed
- 5 focused domain unit tests passed
- 9 HTTP and MongoDB integration scenarios passed
- 0 dependency vulnerabilities reported by npm audit

## Verified rules

- Ordered stops allow forward travel only.
- Refund calculation uses integer INR paise.
- Cancellation cutoff is enforced.
- Operators are restricted to their assigned business.
- Duplicate seat labels and duplicate route stops are rejected.
- Registration creates customer accounts; administrative or operator privileges cannot be self-assigned.
- Operators submit onboarding requests subject to administrator review.
- Login and token revocation work.
- Simultaneous requests cannot confirm the same seat.
- Idempotent replays return the original PNR.
- Cancellation preserves history and releases the seat.
- Invalid seats, journeys and unauthorized access are rejected.
- Overlapping bus schedules are rejected.
- Admin setup, trip policy, audit history and API documentation work end to end.
- Replacement preview rejects smaller layouts and stale revisions.
- Safe replacement preserves PNRs and reconciles occupancy reports.

The frontend was additionally checked in the browser for customer sign-in/search/seat selection, logout transition, operator schedules/reports and the admin setup workspace.
