import { connect, db, client } from '../src/db.js';
import { hashPassword } from '../src/security.js';
await connect();
try {
  if (!process.env.DEMO_PASSWORD || process.env.DEMO_PASSWORD.length < 12) throw new Error('Set DEMO_PASSWORD (12+ characters) in .env before seeding');
  const operator = await db.collection('operators').findOneAndUpdate({ name: 'RouteRelay Demo Travels' }, { $setOnInsert: { name: 'RouteRelay Demo Travels' } }, { upsert: true, returnDocument: 'after' });
  for (const role of ['admin','operator','customer']) {
    await db.collection('users').updateOne({ email: `${role}@routerelay.test` }, { $set: { passwordHash: await hashPassword(process.env.DEMO_PASSWORD) }, $setOnInsert: { name: `Demo ${role}`, role, operatorId: role === 'operator' ? operator._id.toString() : null, createdAt: new Date() } }, { upsert: true });
  }
  const seats = Array.from({ length: 20 }, (_, i) => `${Math.floor(i / 4) + 1}${'ABCD'[i % 4]}`);
  const buses = [];
  for (const registration of ['DEMO-BUS-01','DEMO-BUS-02']) buses.push(await db.collection('buses').findOneAndUpdate({ registration }, { $setOnInsert: { registration, operatorId: operator._id.toString(), seats, revision: 0 } }, { upsert: true, returnDocument: 'after' }));
  const route = await db.collection('routes').findOneAndUpdate({ name: 'Delhi to Jaipur' }, { $setOnInsert: { name: 'Delhi to Jaipur', stops: ['Delhi','Gurugram','Jaipur'] } }, { upsert: true, returnDocument: 'after' });
  for (let day = 1; day <= 7; day++) {
    const departure = new Date(); departure.setUTCDate(departure.getUTCDate() + day); departure.setUTCHours(3,30,0,0);
    await db.collection('trips').updateOne({ seedKey: `demo-${departure.toISOString().slice(0,10)}` }, { $setOnInsert: { busId: buses[0]._id.toString(), routeId: route._id.toString(), operatorId: operator._id.toString(), routeName: route.name, stops: route.stops, departure, arrival: new Date(departure.getTime() + 5 * 3600000), seats, fare: 65000, cancellationHours: 2, refundPercent: 90, status: 'scheduled', revision: 0 } }, { upsert: true });
  }
  const customer = await db.collection('users').findOne({ email: 'customer@routerelay.test' });
  const trips = await db.collection('trips').find({ operatorId: operator._id.toString(), status: 'scheduled' }).sort({ departure: 1 }).toArray();
  const passengerNames = ['Aarav Sharma','Diya Verma','Kabir Singh','Ananya Patel','Vivaan Gupta','Meera Iyer','Arjun Mehta','Isha Kapoor','Reyansh Nair','Saanvi Rao','Aditya Joshi','Kavya Malhotra'];
  const demoPassengers = passengerNames.map((name, index) => ({ name, age: 22 + (index % 19), trip: trips[index % 3], seat: seats[Math.floor(index / 3) % seats.length], cancelled: index === 10 }));
  for (const [index, sample] of demoPassengers.entries()) {
    if (!sample.trip) continue;
    const seedKey = `mock-booking-${index + 1}`;
    const booking = {
      seedKey, userId: customer._id.toString(), operatorId: sample.trip.operatorId, tripId: sample.trip._id.toString(),
      pnr: `ALG-DEMO-${String(index + 1).padStart(3, '0')}`, requestKey: seedKey, fingerprint: `demo-${index + 1}`,
      status: sample.cancelled ? 'cancelled' : 'confirmed', refundStatus: sample.cancelled ? 'simulated_refunded' : 'not_requested',
      ...(sample.cancelled ? { refundAmount: 58500, cancelledAt: new Date() } : {}),
      fare: sample.trip.fare, cancellationHours: sample.trip.cancellationHours, refundPercent: sample.trip.refundPercent,
      routeName: sample.trip.routeName, departure: sample.trip.departure, busId: sample.trip.busId,
      seat: sample.seat, boarding: 'Delhi', drop: 'Jaipur', passenger: { name: sample.name, age: sample.age },
      history: [], createdAt: new Date(),
    };
    await db.collection('bookings').updateOne({ seedKey }, { $setOnInsert: booking }, { upsert: true });
    await db.collection('audit').updateOne({ seedKey }, { $setOnInsert: { seedKey, actorId: customer._id.toString(), tripId: booking.tripId, action: sample.cancelled ? 'booking.cancelled' : 'booking.confirmed', details: { pnr: booking.pnr, seat: booking.seat, source: 'demo seed' }, at: booking.createdAt } }, { upsert: true });
  }
  console.log('Seed ready: accounts, 7 upcoming trips, 12 sample passenger bookings, cancellation/refund and audit events are available.');
} finally { await client.close(); }
