import { connect, db, client } from '../src/db.js';
await connect();
try {
  // Find or create the demo operator
  const operator = await db.collection('operators').findOneAndUpdate(
    { name: 'RouteRelay Demo Travels' },
    { $setOnInsert: { name: 'RouteRelay Demo Travels', revision: 0, createdAt: new Date() } },
    { upsert: true, returnDocument: 'after' }
  );

  // Create a new bus for Delhi-Lucknow
  const seats = Array.from({ length: 20 }, (_, i) => `${Math.floor(i / 4) + 1}${'ABCD'[i % 4]}`);
  const bus = await db.collection('buses').findOneAndUpdate(
    { registration: 'DEMO-BUS-DL-LKO' },
    { $setOnInsert: { registration: 'DEMO-BUS-DL-LKO', operatorId: operator._id.toString(), seats, revision: 0, createdAt: new Date() } },
    { upsert: true, returnDocument: 'after' }
  );

  // Create the Delhi to Lucknow route
  const route = await db.collection('routes').findOneAndUpdate(
    { name: 'Delhi to Lucknow' },
    { $setOnInsert: { name: 'Delhi to Lucknow', stops: ['Delhi', 'Agra', 'Lucknow'] } },
    { upsert: true, returnDocument: 'after' }
  );

  // Seed 7 upcoming daily trips (departing at 08:00 IST = 02:30 UTC)
  let created = 0;
  for (let day = 1; day <= 7; day++) {
    const departure = new Date();
    departure.setUTCDate(departure.getUTCDate() + day);
    departure.setUTCHours(2, 30, 0, 0); // 08:00 IST
    const arrival = new Date(departure.getTime() + 8 * 3600000); // ~8 hour journey

    const result = await db.collection('trips').updateOne(
      { seedKey: `demo-dl-lko-${departure.toISOString().slice(0, 10)}` },
      {
        $setOnInsert: {
          seedKey: `demo-dl-lko-${departure.toISOString().slice(0, 10)}`,
          busId: bus._id.toString(),
          routeId: route._id.toString(),
          operatorId: operator._id.toString(),
          routeName: route.name,
          stops: route.stops,
          departure,
          arrival,
          seats,
          fare: 85000, // ₹850 in paise
          cancellationHours: 2,
          refundPercent: 90,
          status: 'scheduled',
          revision: 0,
        }
      },
      { upsert: true }
    );
    if (result.upsertedCount) created++;
  }

  console.log(`Done! Route: Delhi → Agra → Lucknow | Bus: DEMO-BUS-DL-LKO | Trips created: ${created} | Fare: ₹850`);
} finally {
  await client.close();
}
