import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLANK_FLIGHT,
  elapsedMinutes,
  autoFill,
  toPayload,
  predictFlight,
  riskLevel,
  factorLabel,
  weatherSummary,
  pageFromHash,
} from './flight.js';

test('elapsedMinutes: same-day flight', () => {
  assert.equal(elapsedMinutes('18:30', '20:30'), 120);
});

test('elapsedMinutes: overnight flight wraps past midnight', () => {
  assert.equal(elapsedMinutes('23:30', '01:15'), 105);
});

test('elapsedMinutes: missing time gives null', () => {
  assert.equal(elapsedMinutes('', '10:00'), null);
});

test('autoFill: distance from both airports, duration from both times', () => {
  let f = autoFill(BLANK_FLIGHT, 'origin', 'atl');
  f = autoFill(f, 'destination', 'JFK');
  assert.equal(f.distance, '759');
  f = autoFill(f, 'departure_time', '18:30');
  f = autoFill(f, 'arrival_time', '20:30');
  assert.equal(f.elapsed_time, '120');
});

test('autoFill: unknown airport leaves distance editable', () => {
  const f = autoFill({ ...BLANK_FLIGHT, origin: 'ATL', distance: '500' }, 'destination', 'XYZ');
  assert.equal(f.distance, '500');
});

test('toPayload: trims and upper-cases codes, numbers for duration and distance', () => {
  const p = toPayload({ ...BLANK_FLIGHT, carrier: ' dl ', origin: 'atl', destination: 'jfk', elapsed_time: '120', distance: '760' });
  assert.equal(p.carrier, 'DL');
  assert.equal(p.origin, 'ATL');
  assert.equal(p.distance, 760);
  assert.equal(p.elapsed_time, 120);
});

test('riskLevel: uses the API level, falls back to the yes/no prediction', () => {
  assert.deepEqual(riskLevel({ risk_level: 'moderate', prediction: 'Significant Delay' }), { key: 'moderate', label: 'Moderate risk' });
  assert.deepEqual(riskLevel({ risk_level: 'high' }), { key: 'high', label: 'High risk' });
  assert.deepEqual(riskLevel({ prediction: 'Significant Delay' }), { key: 'high', label: 'High risk' });
  assert.deepEqual(riskLevel({ prediction: 'No Significant Delay' }), { key: 'low', label: 'Low risk' });
});

test('factorLabel: names factors for the flight', () => {
  const flight = { carrier: 'dl', origin: 'atl', destination: 'jfk', flight_date: '2026-07-15', departure_time: '18:30' };
  assert.equal(factorLabel('time', flight), 'Departure time (18:30)');
  assert.equal(factorLabel('day', flight), 'Day of week (Wednesday)');
  assert.equal(factorLabel('airline', flight), 'Airline (Delta Air Lines)');
  assert.equal(factorLabel('dest_weather', flight), 'Weather at JFK');
});

test('pageFromHash: known pages and fallback', () => {
  assert.equal(pageFromHash('#/predict'), 'predict');
  assert.equal(pageFromHash('#/data'), 'data');
  assert.equal(pageFromHash(''), 'overview');
  assert.equal(pageFromHash('#/nope'), 'overview');
});

test('predictFlight: API error message is passed through', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Invalid time. Use HH:MM.' }), { status: 400 });
  await assert.rejects(predictFlight(BLANK_FLIGHT), { message: 'Invalid time. Use HH:MM.' });
});

test('predictFlight: non-JSON response gives a readable error', async () => {
  globalThis.fetch = async () => new Response('<html>Bad gateway</html>', { status: 502 });
  await assert.rejects(predictFlight(BLANK_FLIGHT), { message: 'The prediction service is unavailable. Is the backend running?' });
});

test('weatherSummary: rain, snow and dry conditions', () => {
  assert.equal(weatherSummary({ code: 61, temp: 12.4, precip: 3.2, snow: 0, gust: 44.6 }), 'Rain · 12°C · 3.2 mm rain · gusts 45 km/h');
  assert.equal(weatherSummary({ code: 73, temp: -2, precip: 1, snow: 1.4, gust: 30 }), 'Snow · -2°C · 1.4 cm snow · gusts 30 km/h');
  assert.equal(weatherSummary({ code: 0, temp: 20, precip: 0, snow: 0, gust: 10 }), 'Clear · 20°C · gusts 10 km/h');
});
