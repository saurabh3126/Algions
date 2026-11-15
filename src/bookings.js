import { randomUUID } from 'node:crypto';
import { db, transaction } from './db.js';
import { id, fail, authorizedOperator, validStops, cancellation } from './domain.js';
export async function audit(session, actor, action, tripId, details = {}) {
  await db.collection('audit').insertOne({ actorId: actor._id.toString(), action, tripId, details, at: new Date() }, { session });
}
export async function book(user, data, requestKey) {
  const userId = user._id.toString();
  const fingerprint = JSON.stringify(data);
  async function replay() {
    const old = await db.collection('bookings').findOne({ userId, requestKey });
    if (old && old.fingerprint !== fingerprint) fail(409, 'Idempotency key was used with different booking details');
    return old;
  }
  const existing = await replay(); if (existing) return existing;
  try {
    return await transaction(async session => {
      const trip = await db.collection('trips').findOne({ _id: id(data.tripId) }, { session });
      if (!trip) fail(404, 'Trip not found');
      if (trip.status !== 'scheduled' || trip.departure <= new Date()) fail(409, 'Trip is not open for booking');
      if (!trip.seats.includes(data.seat)) fail(400, 'Invalid seat');
      if (!validStops(trip.stops, data.boarding, data.drop)) fail(400, 'Invalid boarding/drop order');
      // Every booking/cancellation/replacement writes the trip, serializing competing inventory changes.
      await db.collection('trips').updateOne({ _id: trip._id }, { $inc: { revision: 1 } }, { session });
      const booking = { ...data, userId, operatorId: trip.operatorId, pnr: `RR-${randomUUID().replaceAll('-', '').slice(0,16).toUpperCase()}`, requestKey, fingerprint, status: 'confirmed', refundStatus: 'not_requested', fare: trip.fare, cancellationHours: trip.cancellationHours, refundPercent: trip.refundPercent, routeName: trip.routeName, departure: trip.departure, busId: trip.busId, history: [], createdAt: new Date() };
      const result = await db.collection('bookings').insertOne(booking, { session });
      await audit(session, user, 'booking.confirmed', data.tripId, { pnr: booking.pnr, seat: data.seat });
      return { ...booking, _id: result.insertedId };
    });
  } catch (error) {
    if (error.code === 11000) { const old = await replay(); if (old) return old; fail(409, 'Seat is already booked'); }
    throw error;
  }
}
export async function cancel(user, bookingId) {
  return transaction(async session => {
    const booking = await db.collection('bookings').findOne({ _id: id(bookingId) }, { session });
    if (!booking) fail(404, 'Booking not found');
    if (booking.userId !== user._id.toString() && user.role !== 'admin') fail(403, 'Booking access denied');
    if (booking.status === 'cancelled') return booking;
    const trip = await db.collection('trips').findOne({ _id: id(booking.tripId) }, { session });
    const refundAmount = cancellation(booking, trip);
    await db.collection('trips').updateOne({ _id: trip._id }, { $inc: { revision: 1 } }, { session });
    const changes = { status: 'cancelled', refundStatus: 'simulated_refunded', refundAmount, cancelledAt: new Date() };
    await db.collection('bookings').updateOne({ _id: booking._id }, { $set: changes }, { session });
    await audit(session, user, 'booking.cancelled', booking.tripId, { pnr: booking.pnr, refundAmount });
    return { ...booking, ...changes };
  });
}
export async function replaceBus(user, tripId, busId, expectedRevision, preview) {
  return transaction(async session => {
    const trip = await db.collection('trips').findOne({ _id: id(tripId) }, { session });
    if (!trip) fail(404, 'Trip not found');
    authorizedOperator(user, trip.operatorId);
    if (trip.status !== 'disrupted' || trip.departure <= new Date()) fail(409, 'Only future disrupted trips can be reassigned');
    const bus = await db.collection('buses').findOne({ _id: id(busId) }, { session });
    if (!bus || bus.operatorId !== trip.operatorId || busId === trip.busId) fail(400, 'Choose another bus belonging to this operator');
    const bookings = await db.collection('bookings').find({ tripId, status: 'confirmed' }, { session }).toArray();
    const conflict = await db.collection('trips').findOne({ _id: { $ne: trip._id }, busId, departure: { $lt: trip.arrival }, arrival: { $gt: trip.departure } }, { session });
    const affected = bookings.filter(b => !bus.seats.includes(b.seat)).map(b => ({ pnr: b.pnr, seat: b.seat }));
    const sameLayout = bus.seats.length === trip.seats.length && trip.seats.every(s => bus.seats.includes(s));
    const result = { canReplace: sameLayout && !conflict, revision: trip.revision, passengerCount: bookings.length, affected, reason: conflict ? 'Replacement bus has an overlapping trip' : !sameLayout ? 'Automatic replacement requires the same seat layout' : null };
    if (preview) return result;
    if (trip.revision !== expectedRevision) fail(409, 'Trip changed; preview the replacement again');
    if (!result.canReplace) fail(409, result.reason);
    await db.collection('buses').updateOne({ _id: bus._id }, { $inc: { revision: 1 } }, { session });
    await db.collection('trips').updateOne({ _id: trip._id }, { $set: { busId, seats: bus.seats, status: 'scheduled' }, $inc: { revision: 1 } }, { session });
    const change = { type: 'bus_replaced', fromBusId: trip.busId, toBusId: busId, reason: trip.disruptionReason, at: new Date() };
    await db.collection('bookings').updateMany({ tripId, status: 'confirmed' }, { $set: { busId }, $push: { history: change } }, { session });
    await audit(session, user, 'trip.bus_replaced', tripId, change);
    return { ...result, replaced: true };
  });
}
