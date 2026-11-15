import { z } from 'zod';
import { ObjectId } from 'mongodb';
export function fail(status, message) { throw Object.assign(new Error(message), { status }); }
export function id(value) { if (!/^[a-f\d]{24}$/i.test(value || '')) fail(400, 'Invalid identifier'); return new ObjectId(value); }
export const oid = z.string().regex(/^[a-f\d]{24}$/i);
export const text = z.string().trim().min(1).max(120);
export const schemas = {
  operators: z.object({ name: text }),
  buses: z.object({ operatorId: oid, registration: text, seats: z.array(z.string().trim().min(1).max(8)).min(1).max(80).refine(a => new Set(a).size === a.length, 'Seat labels must be unique') }),
  routes: z.object({ name: text, stops: z.array(text).min(2).max(30).refine(a => new Set(a).size === a.length, 'Stops must be unique') }),
  trips: z.object({ busId: oid, routeId: oid, departure: z.iso.datetime({ offset: true }), arrival: z.iso.datetime({ offset: true }), fare: z.number().int().positive().max(10000000), cancellationHours: z.number().min(0).max(168).default(2), refundPercent: z.number().int().min(0).max(100).default(90) }),
  booking: z.object({ tripId: oid, seat: text, boarding: text, drop: text, passenger: z.object({ name: text, age: z.number().int().min(1).max(120) }) }),
};
export function authorizedOperator(user, operatorId) {
  if (user.role !== 'admin' && !(user.role === 'operator' && user.operatorId === operatorId)) fail(403, 'Operator access denied');
}
export function validStops(stops, boarding, drop) { return stops.indexOf(boarding) >= 0 && stops.indexOf(drop) > stops.indexOf(boarding); }
export function cancellation(booking, trip, now = new Date()) {
  if (trip.departure.getTime() - now.getTime() <= booking.cancellationHours * 3600000) fail(409, 'Cancellation cutoff has passed');
  return Math.floor(booking.fare * booking.refundPercent / 100);
}
