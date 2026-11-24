import test from 'node:test';
import assert from 'node:assert/strict';
import { entranceCoordinates, findWalkingRoute } from '../client/src/walkingRoute.js';

const entry = (lat, lng) => ({ location: { latitude: lat, longitude: lng } });
const current = { latitude: 49.25, longitude: -123 };
const mockRouter = (cost, calls = []) => async url => {
  const [start, end] = JSON.parse(url.searchParams.get('json')).locations;
  calls.push([start, end]);
  return { ok: true, json: async () => ({ code: 'Ok', routes: [{
    distance: cost(start, end), duration: 60,
    geometry: { type: 'LineString', coordinates: [[start.lon + 0.00001, start.lat], [end.lon + 0.00001, end.lat]] }
  }] }) };
};

test('filters invalid Firestore entrance data', () => {
  assert.deepEqual(entranceCoordinates({ entrances: [entry(49.25, -123), { location: {} }, null, entry(91, 0)] }), [[-123, 49.25]]);
});

test('chooses the shortest complete route through both buildings entrances', async () => {
  const calls = [];
  const originBuilding = { id: 'a', borders: [[[49.249, -123.001], [49.253, -123.001], [49.253, -122.999], [49.249, -122.999]]], entrances: [entry(49.251, -123), entry(49.252, -123)] };
  const destinationBuilding = { id: 'b', center: [49.254, -123], entrances: [entry(49.253, -123), entry(49.254, -123)] };
  const route = await findWalkingRoute({ current, originBuilding, destinationBuilding, fetchRoute: mockRouter((a, b) => {
    if (a.lat === current.latitude) return b.lat === 49.251 ? 10 : 60;
    return a.lat === 49.251 && b.lat === 49.254 ? 20 : 100;
  }, calls) });
  assert.equal(calls.length, 6);
  assert.ok(route.geometry.coordinates.some(([lng, lat]) => lng === -123 && lat === 49.251));
  assert.deepEqual(route.geometry.coordinates.at(-1), [-123, 49.254]);
  assert.ok(route.distance > 30 && route.distance < 40);
});

test('keeps center based routing if no entrances are available', async () => {
  const calls = [];
  const route = await findWalkingRoute({ current, destinationBuilding: { id: 'b', center: [49.26, -123.01] }, fetchRoute: mockRouter(() => 100, calls) });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], { lat: 49.26, lon: -123.01 });
  assert.ok(route.distance > 100 && route.distance < 102);
  assert.deepEqual(route.geometry.coordinates[0], [-123, 49.25]);
});

test('does not force an exit when starting in the destination building', async () => {
  const calls = [];
  const building = { id: 'a', center: [49.25, -123], entrances: [entry(49.251, -123), entry(49.252, -123)] };
  await findWalkingRoute({ current, originBuilding: building, destinationBuilding: building, fetchRoute: mockRouter(() => 10, calls) });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(([start]) => start.lat === current.latitude));
});

test('reports a failed candidate instead of silently claiming the shortest route', async () => {
  const building = { id: 'b', center: [49.25, -123], entrances: [entry(49.251, -123), entry(49.252, -123)] };
  await assert.rejects(findWalkingRoute({ current, destinationBuilding: building, fetchRoute: async () => ({ ok: false, status: 503 }) }), /503/);
});


test('replaces an indoor route that exits through a wall with a direct line to the entrance', async () => {
  const originBuilding = { id: 'a', borders: [[[49.249, -123.001], [49.251, -123.001], [49.251, -122.999], [49.249, -122.999]]], entrances: [entry(49.25, -122.999)] };
  const destinationBuilding = { id: 'b', center: [49.25, -122.997], entrances: [entry(49.25, -122.997)] };
  const fetchRoute = async url => {
    const [start, end] = JSON.parse(url.searchParams.get('json')).locations;
    const points = start.lon === -123
      ? [[-123, 49.25], [-123.002, 49.25], [end.lon, end.lat]]
      : [[start.lon, start.lat], [end.lon, end.lat]];
    return { ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 300, duration: 100, geometry: { type: 'LineString', coordinates: points } }] }) };
  };
  const route = await findWalkingRoute({ current, originBuilding, destinationBuilding, fetchRoute });
  assert.deepEqual(route.geometry.coordinates.slice(0, 2), [[-123, 49.25], [-122.999, 49.25]]);
  assert.ok(!route.geometry.coordinates.some(([lng]) => lng === -123.002));
});
