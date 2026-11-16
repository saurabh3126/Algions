import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
process.env.MONGODB_DB = `rr_test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
const { app } = await import('../src/app.js');
const { connect, db, client } = await import('../src/db.js');
const { hashPassword } = await import('../src/security.js');
let server, base, admin, operator, customer, other, trip, replacement, smallBus;
async function api(path, method = 'GET', token, body, headers = {}) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: response.status === 204 ? null : await response.json() };
}
before(async () => {
  await connect();
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const op = await db.collection('operators').insertOne({ name: 'Test operator' });
  for (const role of ['admin','operator','customer','other']) {
    await db.collection('users').insertOne({ name: role, email: `${role}@test.example`, role: role === 'other' ? 'customer' : role, operatorId: op.insertedId.toString(), passwordHash: await hashPassword('test-password-123') });
  }
  const tokens = [];
  for (const role of ['admin','operator','customer','other']) {
    const result = await api('/api/auth/login', 'POST', null, { email: `${role}@test.example`, password: 'test-password-123' });
    assert.equal(result.status, 200); tokens.push(result.data.accessToken);
  }
  [admin, operator, customer, other] = tokens;
  const buses = [];
  for (let i = 0; i < 3; i++) {
    const result = await api('/api/buses', 'POST', admin, { operatorId: op.insertedId.toString(), registration: `TEST-${i}`, seats: i === 2 ? ['1A'] : ['1A','1B','2A','2B'] });
    assert.equal(result.status, 201); buses.push(result.data);
  }
  replacement = buses[1]; smallBus = buses[2];
  const route = await api('/api/routes', 'POST', admin, { name: 'Test route', stops: ['Delhi','Gurugram','Jaipur'] });
  const result = await api('/api/trips', 'POST', operator, { busId: buses[0]._id, routeId: route.data._id, departure: new Date(Date.now() + 86400000).toISOString(), arrival: new Date(Date.now() + 108000000).toISOString(), fare: 65000 });
  assert.equal(result.status, 201); trip = result.data;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await db.dropDatabase(); await client.close(); });
const bookingData = seat => ({ tripId: trip._id, seat, boarding: 'Delhi', drop: 'Jaipur', passenger: { name: 'Demo Passenger', age: 25 } });
test('registration cannot grant admin privileges and login/logout work', async () => {
  const result = await api('/api/auth/register', 'POST', null, { name: 'New user', email: 'new@test.example', password: 'long-password-123', role: 'admin' });
  assert.equal(result.status, 201); assert.equal(result.data.role, 'customer');
  const login = await api('/api/auth/login', 'POST', null, { email: 'new@test.example', password: 'long-password-123' });
  assert.equal((await api('/api/auth/logout', 'POST', login.data.accessToken)).status, 204);
  assert.equal((await api('/api/auth/me', 'GET', login.data.accessToken)).status, 401);
});
test('operators can submit requests and admins can review them', async () => {
  const req = await api('/api/operator-requests', 'POST', null, { name: 'Applicant', email: 'applicant@operator.example', companyName: 'Express Travels', phone: '+919999999999', fleetSize: 5, message: 'Delhi-Agra route' });
  assert.equal(req.status, 201);
  const list = await api('/api/operator-requests', 'GET', admin);
  assert.equal(list.status, 200);
  assert(list.data.some(r => r.email === 'applicant@operator.example' && r.status === 'pending'));
});
test('simultaneous seat requests produce exactly one booking; replay and cancellation preserve integrity', async () => {
  const data = bookingData('1A');
  const results = await Promise.all([api('/api/bookings','POST',customer,data,{'Idempotency-Key':'race-key-1'}),api('/api/bookings','POST',other,data,{'Idempotency-Key':'race-key-2'})]);
  assert.deepEqual(results.map(r => r.status).sort(), [201,409]);
  const index = results.findIndex(r => r.status === 201), winner = results[index].data;
  const winnerToken = index === 0 ? customer : other;
  const repeat = await api('/api/bookings','POST',winnerToken,data,{'Idempotency-Key':index === 0 ? 'race-key-1' : 'race-key-2'});
  assert.equal(repeat.data.pnr, winner.pnr);
  assert.equal((await api(`/api/bookings/${winner._id}`,'GET',index === 0 ? other : customer)).status,403);
  const cancelled = await api(`/api/bookings/${winner._id}/cancel`,'POST',winnerToken);
  assert.equal(cancelled.status,200); assert.equal(cancelled.data.refundAmount,58500);
  assert.equal((await api('/api/bookings','POST',customer,data,{'Idempotency-Key':'new-after-cancel'})).status,201);
});
test('invalid stops, invalid seat and role checks reject unsafe input', async () => {
  assert.equal((await api('/api/bookings','POST',customer,{...bookingData('1B'),boarding:'Jaipur',drop:'Delhi'},{'Idempotency-Key':'invalid-stops'})).status,400);
  assert.equal((await api('/api/bookings','POST',customer,bookingData('9Z'),{'Idempotency-Key':'invalid-seat'})).status,400);
  assert.equal((await api('/api/operator/trips','GET',customer)).status,403);
  assert.equal((await api('/api/bookings','POST',null,bookingData('1B'))).status,401);
});
test('admin setup, trip policy, audit and API documentation work end to end', async () => {
  const operatorRecord = await api('/api/operators','POST',admin,{name:'Second operator'});
  assert.equal(operatorRecord.status,201);
  const bus = await api('/api/buses','POST',admin,{operatorId:operatorRecord.data._id,registration:'ADMIN-SETUP-1',seats:['1A','1B']});
  assert.equal(bus.status,201);
  const route = await api('/api/routes','POST',admin,{name:'Admin route',stops:['Pune','Lonavala','Mumbai']});
  assert.equal(route.status,201);
  assert.equal((await api(`/api/routes/${route.data._id}`,'PUT',admin,{name:'Admin route updated',stops:['Pune','Lonavala','Mumbai']})).status,200);
  assert.equal((await api('/api/operator-accounts','POST',admin,{name:'Second staff',email:'second.staff@test.example',password:'staff-password-123',operatorId:operatorRecord.data._id})).status,201);
  assert.equal((await api(`/api/trips/${trip._id}/policy`,'PATCH',operator,{fare:70000,cancellationHours:3,refundPercent:80})).status,200);
  const report = await api(`/api/operator/trips/${trip._id}/report`,'GET',operator);
  assert.equal(report.data.trip.fare,70000); assert.equal(report.data.trip.refundPercent,80);
  const audit = await api(`/api/operator/trips/${trip._id}/audit`,'GET',operator);
  assert.equal(audit.data.some(event => event.action === 'trip.policy_updated'),true);
  const docs = await fetch(base + '/docs');
  assert.equal(docs.status,200); assert.match(await docs.text(),/Algions API/);
  assert.equal((await fetch(base + '/openapi.json')).status,200);
});
test('search returns journey and seat availability; overlapping schedules fail', async () => {
  const date = new Date(new Date(trip.departure).getTime() + 19800000).toISOString().slice(0,10);
  const search = await api(`/api/trips?origin=Delhi&destination=Jaipur&date=${date}`);
  assert.equal(search.status,200); assert.equal(search.data.items[0].availableSeats,3);
  assert.equal((await api(`/api/trips?origin=Jaipur&destination=Delhi&date=${date}`)).data.total,0);
  assert.equal((await api(`/api/trips?origin=Delhi&destination=Jaipur&date=${date}&page=1.5`)).status,400);
  const overlap = await api('/api/trips','POST',operator,{busId:trip.busId,routeId:trip.routeId,departure:trip.departure,arrival:trip.arrival,fare:65000});
  assert.equal(overlap.status,409);
});
test('simultaneous duplicate confirmation requests share a single ticket', async () => {
  const data = bookingData('1B');
  const results = await Promise.all([1,2].map(() => api('/api/bookings','POST',customer,data,{'Idempotency-Key':'same-request-race'})));
  assert.deepEqual(results.map(r => r.status),[201,201]);
  assert.equal(results[0].data.pnr,results[1].data.pnr);
  assert.equal((await api('/api/bookings','POST',customer,bookingData('2A'),{'Idempotency-Key':'same-request-race'})).status,409);
  assert.equal((await api(`/api/bookings/${results[0].data._id}/cancel`,'POST',customer)).status,200);
});
test('replacement preview blocks smaller layout, preserves PNR and produces reconciled report', async () => {
  const booking = await api('/api/bookings','POST',customer,bookingData('2B'),{'Idempotency-Key':'replacement-booking'});
  assert.equal(booking.status,201);
  assert.equal((await api(`/api/operator/trips/${trip._id}/disrupt`,'POST',operator,{reason:'Mechanical fault'})).status,200);
  const badPreview = await api(`/api/operator/trips/${trip._id}/replacement-preview`,'POST',operator,{busId:smallBus._id});
  assert.equal(badPreview.data.canReplace,false); assert.equal(badPreview.data.affected.length,1);
  assert.equal((await api(`/api/operator/trips/${trip._id}/replace-bus`,'POST',operator,{busId:smallBus._id,revision:badPreview.data.revision})).status,409);
  const preview = await api(`/api/operator/trips/${trip._id}/replacement-preview`,'POST',operator,{busId:replacement._id});
  assert.equal(preview.data.canReplace,true);
  assert.equal((await api(`/api/operator/trips/${trip._id}/replace-bus`,'POST',operator,{busId:replacement._id,revision:preview.data.revision - 1})).status,409);
  assert.equal((await api(`/api/operator/trips/${trip._id}/replace-bus`,'POST',operator,{busId:replacement._id,revision:preview.data.revision})).status,200);
  const ticket = await api(`/api/bookings/${booking.data._id}`,'GET',customer);
  assert.equal(ticket.data.pnr,booking.data.pnr); assert.equal(ticket.data.busId,replacement._id); assert.equal(ticket.data.history.length,1);
  const report = await api(`/api/operator/trips/${trip._id}/report`,'GET',operator);
  assert.equal(report.data.confirmedCount,2); assert.equal(report.data.occupancyPercent,50); assert.equal(report.data.cancelledCount,2);
});
test('cancellation cutoff is enforced and another operator cannot access manifest', async () => {
  const bookings = await api('/api/bookings','GET',customer);
  const confirmed = bookings.data.find(b => b.status === 'confirmed');
  const { ObjectId } = await import('mongodb');
  await db.collection('trips').updateOne({_id:new ObjectId(trip._id)},{$set:{departure:new Date(Date.now()+3600000)}});
  assert.equal((await api(`/api/bookings/${confirmed._id}/cancel`,'POST',customer)).status,409);
  await db.collection('users').updateOne({email:'operator@test.example'},{$set:{operatorId:new ObjectId().toString()}});
  assert.equal((await api(`/api/operator/trips/${trip._id}/report`,'GET',operator)).status,403);
});
