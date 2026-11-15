import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validStops, cancellation, authorizedOperator, schemas } from '../src/domain.js';

test('ordered stop validation accepts only forward travel', () => {
  const stops = ['Delhi', 'Gurugram', 'Jaipur'];
  assert.equal(validStops(stops, 'Delhi', 'Jaipur'), true);
  assert.equal(validStops(stops, 'Jaipur', 'Delhi'), false);
  assert.equal(validStops(stops, 'Delhi', 'Delhi'), false);
  assert.equal(validStops(stops, 'Delhi', 'Agra'), false);
});

test('cancellation returns the policy refund in integer paise', () => {
  const now = new Date('2026-11-12T00:00:00Z');
  const trip = { departure: new Date('2026-11-13T00:00:00Z') };
  assert.equal(cancellation({ fare: 65000, refundPercent: 90, cancellationHours: 2 }, trip, now), 58500);
});

test('cancellation rejects requests at or after the cutoff', () => {
  const now = new Date('2026-11-12T22:00:00Z');
  assert.throws(() => cancellation({ fare: 65000, refundPercent: 90, cancellationHours: 2 }, { departure: new Date('2026-11-13T00:00:00Z') }, now), error => error.status === 409);
});

test('operator authorization is scoped and admins are unrestricted', () => {
  assert.doesNotThrow(() => authorizedOperator({ role: 'admin' }, 'operator-a'));
  assert.doesNotThrow(() => authorizedOperator({ role: 'operator', operatorId: 'operator-a' }, 'operator-a'));
  assert.throws(() => authorizedOperator({ role: 'operator', operatorId: 'operator-b' }, 'operator-a'), error => error.status === 403);
});

test('seat layouts and routes reject duplicates', () => {
  assert.equal(schemas.buses.safeParse({ operatorId: 'a'.repeat(24), registration: 'BUS-1', seats: ['1A','1A'] }).success, false);
  assert.equal(schemas.routes.safeParse({ name: 'Loop', stops: ['Delhi','Delhi'] }).success, false);
});
