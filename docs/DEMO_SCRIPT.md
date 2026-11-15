# RouteRelay 3 to 5 Minute Demo Script

## 0:00 to 0:30 Introduction

Introduce RouteRelay as a bus booking system with a disruption-recovery workflow. Briefly show the architecture and ER diagrams. State that the demo uses synthetic data and simulated refunds.

## 0:30 to 1:30 Customer journey

1. Sign in as `customer@routerelay.test`.
2. Search Delhi to Jaipur for tomorrow.
3. Open the seat map, select a seat and enter passenger details.
4. Confirm and show the generated PNR, passenger, route, date and seat.
5. Open My Tickets to show persistent booking history.

## 1:30 to 2:15 Seat integrity and cancellation

1. Show the automated test output for simultaneous booking; only one request succeeds.
2. Cancel a demo ticket and show simulated refund status.
3. Search/open the seat map again to show the seat is available.

## 2:15 to 3:30 Operator and unique recovery feature

1. Sign in as `operator@routerelay.test`.
2. Select the booked trip and show occupancy, fare summary and manifest.
3. Download the CSV manifest.
4. Report a mechanical disruption.
5. Preview a smaller replacement bus to demonstrate safe rejection.
6. Preview and confirm the matching bus.
7. Return to the customer ticket and show the unchanged PNR and recorded bus change.

## 3:30 to 4:15 Admin and API evidence

1. Sign in as `admin@routerelay.test`.
2. Show operator, bus/seat-layout, route, trip and staff-account setup screens.
3. Open `/docs` and briefly show the OpenAPI endpoints.

## 4:15 to 5:00 Verification and limitations

Run `npm test` and show all unit and integration tests passing. Mention the local setup command and the documented limits: one passenger per booking, whole-trip seat inventory, simulated payments/refunds and same-layout automatic replacement.
