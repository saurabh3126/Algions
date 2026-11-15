import { MongoClient } from 'mongodb';
export const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/?replicaSet=routerelay&directConnection=true', { serverSelectionTimeoutMS: 5000 });
export const db = client.db(process.env.MONGODB_DB || 'routerelay');
export async function connect() {
  await client.connect();
  const hello = await db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') throw new Error('MongoDB replica set required for booking transactions');
  for (const name of ['users','sessions','operators','buses','routes','trips','bookings','audit']) {
    if (!(await db.listCollections({ name }).hasNext())) await db.createCollection(name);
  }
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('sessions').createIndex({ tokenHash: 1 }, { unique: true });
  await db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection('buses').createIndex({ registration: 1 }, { unique: true });
  await db.collection('trips').createIndex({ departure: 1, routeId: 1 });
  await db.collection('bookings').createIndex({ pnr: 1 }, { unique: true });
  await db.collection('bookings').createIndex({ userId: 1, requestKey: 1 }, { unique: true });
  await db.collection('bookings').createIndex({ tripId: 1, seat: 1 }, { unique: true, partialFilterExpression: { status: 'confirmed' } });
  await db.collection('audit').createIndex({ tripId: 1, at: -1 });
}
export async function transaction(fn) {
  return client.withSession(session => session.withTransaction(() => fn(session), { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }));
}
