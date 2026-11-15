import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { db, transaction } from './db.js';
import { hashPassword, verifyPassword, token, hashToken } from './security.js';
import { schemas, id, oid, text, fail, authorizedOperator, validStops } from './domain.js';
import { book, cancel, replaceBus, audit } from './bookings.js';
export const app = express();
app.set('trust proxy', 1); // Required for Render/reverse-proxy: lets express-rate-limit read X-Forwarded-For correctly
app.use(helmet(), cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }), express.json({ limit: '32kb' }));
app.use(rateLimit({ windowMs: 60000, limit: 300 }));
const authLimit = rateLimit({ windowMs: 15 * 60000, limit: 30 });
const safeUser = u => ({ id: u._id, name: u.name, email: u.email, role: u.role, operatorId: u.operatorId });
const safeBooking = ({ fingerprint, requestKey, ...booking }) => booking;
const page = req => {
  const { page, limit } = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
  return { limit, skip: (page - 1) * limit };
};
async function auth(req, res, next) {
  const bearer = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!bearer) fail(401, 'Sign in required');
  const session = await db.collection('sessions').findOne({ tokenHash: hashToken(bearer), expiresAt: { $gt: new Date() } });
  if (!session) fail(401, 'Session expired or invalid');
  req.user = await db.collection('users').findOne({ _id: id(session.userId) });
  if (!req.user) fail(401, 'Account unavailable');
  req.tokenHash = session.tokenHash;
  next();
}
const roles = (...allowed) => (req, res, next) => { if (!allowed.includes(req.user.role)) fail(403, 'Role not permitted'); next(); };
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'Algions' }));
app.get('/ready', async (req, res) => { await db.command({ ping: 1 }); res.json({ status: 'ready' }); });
app.post('/api/auth/register', authLimit, async (req, res) => {
  const data = z.object({ name: text, email: z.email().toLowerCase(), password: z.string().min(12).max(128) }).parse(req.body);
  const { password, ...user } = data;
  const result = await db.collection('users').insertOne({ ...user, passwordHash: await hashPassword(password), role: 'customer', createdAt: new Date() });
  res.status(201).json({ id: result.insertedId, role: 'customer' });
});
app.post('/api/auth/login', authLimit, async (req, res) => {
  const data = z.object({ email: z.email().toLowerCase(), password: z.string().min(1).max(128) }).parse(req.body);
  const user = await db.collection('users').findOne({ email: data.email });
  if (!user || !await verifyPassword(data.password, user.passwordHash)) fail(401, 'Invalid email or password');
  const accessToken = token(); const expiresAt = new Date(Date.now() + 8 * 3600000);
  await db.collection('sessions').insertOne({ tokenHash: hashToken(accessToken), userId: user._id.toString(), expiresAt });
  res.json({ accessToken, expiresAt, user: safeUser(user) });
});
app.get('/api/auth/me', auth, (req, res) => res.json(safeUser(req.user)));
app.post('/api/auth/logout', auth, async (req, res) => { await db.collection('sessions').deleteOne({ tokenHash: req.tokenHash }); res.sendStatus(204); });
for (const resource of ['operators','buses','routes']) {
  app.get(`/api/${resource}`, auth, roles('admin','operator'), async (req, res) => {
    const filter = resource === 'buses' && req.user.role === 'operator' ? { operatorId: req.user.operatorId } : {};
    if (resource === 'operators' && req.user.role === 'operator') filter._id = id(req.user.operatorId);
    res.json(await db.collection(resource).find(filter, page(req)).toArray());
  });
  app.post(`/api/${resource}`, auth, roles('admin'), async (req, res) => {
    const data = schemas[resource].parse(req.body);
    if (resource === 'buses' && !await db.collection('operators').findOne({ _id: id(data.operatorId) })) fail(400, 'Unknown operator');
    const result = await db.collection(resource).insertOne({ ...data, revision: 0, createdAt: new Date() });
    res.status(201).json({ ...data, _id: result.insertedId });
  });
  app.put(`/api/${resource}/:id`, auth, roles('admin'), async (req, res) => {
    const data = schemas[resource].parse(req.body);
    const result = await transaction(async session => {
      const existing = await db.collection(resource).findOne({ _id: id(req.params.id) }, { session });
      if (!existing) fail(404, 'Record not found');
      if (resource === 'buses' && data.operatorId !== existing.operatorId) fail(409, 'Bus operator cannot be changed; create a new bus record');
      await db.collection(resource).updateOne({ _id: existing._id }, { $set: data, $inc: { revision: 1 } }, { session });
      await audit(session, req.user, `${resource}.updated`, null, { resourceId: req.params.id });
      return { ...existing, ...data };
    });
    res.json(result);
  });
}
app.post('/api/operator-accounts', auth, roles('admin'), async (req, res) => {
  const data = z.object({ name: text, email: z.email().toLowerCase(), password: z.string().min(12).max(128), operatorId: oid }).parse(req.body);
  if (!await db.collection('operators').findOne({ _id: id(data.operatorId) })) fail(400, 'Unknown operator');
  const { password, ...fields } = data;
  const user = { ...fields, role: 'operator', passwordHash: await hashPassword(password), createdAt: new Date() };
  const result = await db.collection('users').insertOne(user);
  res.status(201).json(safeUser({ ...user, _id: result.insertedId }));
});
app.patch('/api/trips/:id/policy', auth, roles('admin','operator'), async (req, res) => {
  const data = z.object({ fare: z.number().int().positive().max(10000000), cancellationHours: z.number().min(0).max(168), refundPercent: z.number().int().min(0).max(100) }).parse(req.body);
  await transaction(async session => {
    const trip = await db.collection('trips').findOne({ _id: id(req.params.id) }, { session });
    if (!trip) fail(404, 'Trip not found'); authorizedOperator(req.user, trip.operatorId);
    if (trip.departure <= new Date()) fail(409, 'Cannot change a departed trip');
    await db.collection('trips').updateOne({ _id: trip._id }, { $set: data, $inc: { revision: 1 } }, { session });
    await audit(session, req.user, 'trip.policy_updated', req.params.id, data);
  });
  res.json(data);
});
app.post('/api/trips', auth, roles('admin','operator'), async (req, res) => {
  const data = schemas.trips.parse(req.body);
  const departure = new Date(data.departure), arrival = new Date(data.arrival);
  if (departure <= new Date() || arrival <= departure) fail(400, 'Trip must depart in the future and arrive after departure');
  const trip = await transaction(async session => {
    const bus = await db.collection('buses').findOne({ _id: id(data.busId) }, { session });
    const route = await db.collection('routes').findOne({ _id: id(data.routeId) }, { session });
    if (!bus || !route) fail(400, 'Unknown bus or route');
    authorizedOperator(req.user, bus.operatorId);
    await db.collection('buses').updateOne({ _id: bus._id }, { $inc: { revision: 1 } }, { session });
    if (await db.collection('trips').findOne({ busId: data.busId, departure: { $lt: arrival }, arrival: { $gt: departure } }, { session })) fail(409, 'Bus already scheduled during this interval');
    const doc = { ...data, departure, arrival, operatorId: bus.operatorId, seats: bus.seats, routeName: route.name, stops: route.stops, status: 'scheduled', revision: 0 };
    const result = await db.collection('trips').insertOne(doc, { session });
    await audit(session, req.user, 'trip.created', result.insertedId.toString());
    return { ...doc, _id: result.insertedId };
  });
  res.status(201).json(trip);
});
app.get('/api/trips', async (req, res) => {
  const q = z.object({ origin: text, destination: text, date: z.iso.date() }).parse(req.query);
  // Search dates use Indian Standard Time; timestamps returned in UTC.
  const start = new Date(`${q.date}T00:00:00+05:30`), end = new Date(start.getTime() + 86400000);
  const trips = await db.collection('trips').find({ status: 'scheduled', departure: { $gte: new Date(Math.max(start.getTime(), Date.now())), $lt: end }, stops: { $all: [q.origin, q.destination] } }).sort({ departure: 1 }).toArray();
  const filtered = trips.filter(t => validStops(t.stops, q.origin, q.destination));
  const { skip, limit } = page(req);
  const results = [];
  for (const trip of filtered.slice(skip, skip + limit)) {
    const occupied = await db.collection('bookings').countDocuments({ tripId: trip._id.toString(), status: 'confirmed' });
    results.push({ ...trip, availableSeats: trip.seats.length - occupied, durationMinutes: (trip.arrival - trip.departure) / 60000 });
  }
  res.json({ total: filtered.length, items: results });
});
app.get('/api/trips/:id/seats', async (req, res) => {
  const trip = await db.collection('trips').findOne({ _id: id(req.params.id) });
  if (!trip) fail(404, 'Trip not found');
  const booked = await db.collection('bookings').find({ tripId: req.params.id, status: 'confirmed' }).project({ seat: 1 }).toArray();
  res.json({ trip, seats: trip.seats.map(seat => ({ seat, available: !booked.some(b => b.seat === seat) })) });
});
app.post('/api/bookings', auth, roles('customer'), async (req, res) => {
  const requestKey = z.string().min(8).max(100).parse(req.headers['idempotency-key']);
  res.status(201).json(safeBooking(await book(req.user, schemas.booking.parse(req.body), requestKey)));
});
app.get('/api/bookings', auth, async (req, res) => {
  res.json((await db.collection('bookings').find({ userId: req.user._id.toString() }, page(req)).sort({ createdAt: -1 }).toArray()).map(safeBooking));
});
app.get('/api/bookings/:id', auth, async (req, res) => {
  const booking = await db.collection('bookings').findOne({ _id: id(req.params.id) });
  if (!booking) fail(404, 'Booking not found');
  if (booking.userId !== req.user._id.toString()) authorizedOperator(req.user, booking.operatorId);
  res.json(safeBooking(booking));
});
app.post('/api/bookings/:id/cancel', auth, async (req, res) => res.json(safeBooking(await cancel(req.user, req.params.id))));
app.get('/api/operator/trips', auth, roles('admin','operator'), async (req, res) => {
  res.json(await db.collection('trips').find(req.user.role === 'admin' ? {} : { operatorId: req.user.operatorId }, page(req)).sort({ departure: 1 }).toArray());
});
app.get('/api/operator/trips/:id/report', auth, roles('admin','operator'), async (req, res) => {
  res.json(await transaction(async session => {
    const trip = await db.collection('trips').findOne({ _id: id(req.params.id) }, { session });
    if (!trip) fail(404, 'Trip not found'); authorizedOperator(req.user, trip.operatorId);
    const bookings = await db.collection('bookings').find({ tripId: req.params.id }, { session }).toArray();
    const manifest = bookings.filter(b => b.status === 'confirmed').map(safeBooking);
    return { trip, manifest, confirmedCount: manifest.length, cancelledCount: bookings.length - manifest.length, occupancyPercent: Math.round(100 * manifest.length / trip.seats.length), confirmedFare: manifest.reduce((sum, b) => sum + b.fare, 0), simulatedRefunds: bookings.reduce((sum, b) => sum + (b.refundAmount || 0), 0) };
  }));
});
app.post('/api/operator/trips/:id/disrupt', auth, roles('admin','operator'), async (req, res) => {
  const { reason } = z.object({ reason: text }).parse(req.body);
  await transaction(async session => {
    const trip = await db.collection('trips').findOne({ _id: id(req.params.id) }, { session });
    if (!trip) fail(404, 'Trip not found'); authorizedOperator(req.user, trip.operatorId);
    if (trip.departure <= new Date() || trip.status !== 'scheduled') fail(409, 'Only future scheduled trips can be disrupted');
    await db.collection('trips').updateOne({ _id: trip._id }, { $set: { status: 'disrupted', disruptionReason: reason }, $inc: { revision: 1 } }, { session });
    await audit(session, req.user, 'trip.disrupted', req.params.id, { reason });
  });
  res.json({ status: 'disrupted' });
});
for (const action of ['replacement-preview','replace-bus']) {
  app.post(`/api/operator/trips/:id/${action}`, auth, roles('admin','operator'), async (req, res) => {
    const data = z.object({ busId: oid, revision: z.number().int().nonnegative().optional() }).parse(req.body);
    if (action === 'replace-bus' && data.revision === undefined) fail(400, 'Preview revision required');
    res.json(await replaceBus(req.user, req.params.id, data.busId, data.revision, action === 'replacement-preview'));
  });
}
app.get('/api/operator/trips/:id/audit', auth, roles('admin','operator'), async (req, res) => {
  const trip = await db.collection('trips').findOne({ _id: id(req.params.id) });
  if (!trip) fail(404, 'Trip not found'); authorizedOperator(req.user, trip.operatorId);
  res.json(await db.collection('audit').find({ tripId: req.params.id }, page(req)).sort({ at: -1 }).toArray());
});
const frontendDirectory = fileURLToPath(new URL('../frontend/', import.meta.url));
app.use(express.static(frontendDirectory, { extensions: ['html'] }));
app.use((req, res) => req.path.startsWith('/api/') ? res.status(404).json({ error: 'Endpoint not found' }) : res.sendFile(path.join(frontendDirectory, 'index.html')));
app.use((error, req, res, next) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: error.issues });
  if (error.code === 11000) return res.status(409).json({ error: 'Record already exists' });
  const status = error.status || 500;
  if (status === 500) console.error(JSON.stringify({ event: 'request.error', method: req.method, path: req.path, message: error.message }));
  res.status(status).json({ error: status === 500 ? 'Internal server error' : error.message });
});
