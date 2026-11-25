// Coordinates used here are GeoJSON [longitude, latitude].
export function entranceCoordinates(building) {
  if (!Array.isArray(building?.entrances)) return [];
  return building.entrances.flatMap(entrance => {
    const location = entrance?.location;
    const lat = location?.latitude;
    const lng = location?.longitude;
    return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180
      ? [[lng, lat]] : [];
  });
}

function distanceBetween([lng1, lat1], [lng2, lat2]) {
  const radians = Math.PI / 180;
  const dLat = (lat2 - lat1) * radians;
  const dLng = (lng2 - lng1) * radians;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

async function requestRoute(start, end, signal, fetchRoute) {
  const url = new URL('https://valhalla1.openstreetmap.de/route');
  url.searchParams.set('json', JSON.stringify({
    locations: [start, end].map(([lon, lat]) => ({ lat, lon })),
    costing: 'pedestrian', format: 'osrm', shape_format: 'geojson'
  }));
  const response = await fetchRoute(url, { signal, headers: { 'X-Client-Id': 'bcit-bby-campus-map' } });
  if (!response.ok) throw new Error(`Routing service returned ${response.status}`);
  const data = await response.json();
  const route = data.routes?.[0];
  const coordinates = route?.geometry?.coordinates;
  if (data.code !== 'Ok' || route?.geometry?.type !== 'LineString' ||
      !Array.isArray(coordinates) || coordinates.length < 2 ||
      !coordinates.every(point => Array.isArray(point) && point.length >= 2 && point.slice(0, 2).every(Number.isFinite)) ||
      !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
    throw new Error('No walking route found');
  }
  return route;
}

// Building borders use [latitude, longitude]; routing uses [longitude, latitude].
function insideOrOnBoundary(point, border) {
  let inside = false;
  for (let i = 0, j = border.length - 1; i < border.length; j = i++) {
    const [ay, ax] = border[j];
    const [by, bx] = border[i];
    const cross = (point[0] - ax) * (by - ay) - (point[1] - ay) * (bx - ax);
    if (Math.abs(cross) < 1e-12 && point[0] >= Math.min(ax, bx) - 1e-10 && point[0] <= Math.max(ax, bx) + 1e-10 &&
        point[1] >= Math.min(ay, by) - 1e-10 && point[1] <= Math.max(ay, by) + 1e-10) return true;
    if ((ay > point[1]) !== (by > point[1]) && point[0] < (bx - ax) * (point[1] - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

// Check each interval between boundary intersections, including concave footprints.
function segmentInside(pointA, pointB, borders) {
  const dx = pointB[0] - pointA[0], dy = pointB[1] - pointA[1];
  const cuts = [0, 1];
  for (const border of borders) for (let i = 0; i < border.length; i++) {
    const [ay, ax] = border[i], [by, bx] = border[(i + 1) % border.length];
    const ex = bx - ax, ey = by - ay;
    const denominator = dx * ey - dy * ex;
    if (Math.abs(denominator) < 1e-18) continue;
    const t = ((ax - pointA[0]) * ey - (ay - pointA[1]) * ex) / denominator;
    const u = ((ax - pointA[0]) * dy - (ay - pointA[1]) * dx) / denominator;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
  }
  cuts.sort((a, b) => a - b);
  return cuts.slice(1).every((end, i) => {
    const t = (cuts[i] + end) / 2;
    const point = [pointA[0] + t * dx, pointA[1] + t * dy];
    return borders.some(border => insideOrOnBoundary(point, border));
  });
}

function staysInsideBuilding(coordinates, building) {
  const borders = (building?.borders ?? [building?.border]).filter(border => Array.isArray(border) && border.length >= 3);
  if (!borders.length) return false;
  return coordinates.slice(1).every((point, i) => segmentInside(coordinates[i], point, borders));
}

function directRoute(start, end) {
  const distance = distanceBetween(start, end);
  return { coordinates: [start, end], distance, duration: distance / 1.4 };
}

// Include the short gaps between a snapped route and actual entrance coordinates.
function connectRoute(route, startEntrance, endEntrance) {
  const coordinates = route.geometry.coordinates.map(point => point.slice(0, 2));
  let extraDistance = 0;
  if (startEntrance) {
    extraDistance += distanceBetween(startEntrance, coordinates[0]);
    coordinates.unshift(startEntrance);
  }
  if (endEntrance) {
    extraDistance += distanceBetween(coordinates.at(-1), endEntrance);
    coordinates.push(endEntrance);
  }
  return { coordinates, distance: route.distance + extraDistance, duration: route.duration + extraDistance / 1.4 };
}

export async function findWalkingRoute({ current, originBuilding, destinationBuilding, signal, fetchRoute = fetch }) {
  const start = [current.longitude, current.latitude];
  const destinationEntrances = entranceCoordinates(destinationBuilding);
  const destinationPoints = destinationEntrances.length ? destinationEntrances : [[destinationBuilding.center[1], destinationBuilding.center[0]]];
  // A trip within the same building goes directly to its destination entrance.
  const originEntrances = originBuilding?.id === destinationBuilding.id ? [] : entranceCoordinates(originBuilding);
  const originPoints = originEntrances.length ? originEntrances : [null];
  const indoorRoutes = await Promise.all(originPoints.map(async entrance => {
    if (!entrance) return null;
    const routed = connectRoute(await requestRoute(start, entrance, signal, fetchRoute), start, entrance);
    return staysInsideBuilding(routed.coordinates, originBuilding) ? routed : directRoute(start, entrance);
  }));
  const candidates = await Promise.all(originPoints.flatMap((origin, index) => destinationPoints.map(async destination => {
    const outdoor = connectRoute(
      await requestRoute(origin ?? start, destination, signal, fetchRoute),
      origin ?? (originEntrances.length ? null : start), destinationEntrances.length ? destination : null
    );
    const indoor = indoorRoutes[index];
    return {
      geometry: { type: 'LineString', coordinates: indoor ? [...indoor.coordinates, ...outdoor.coordinates.slice(1)] : outdoor.coordinates },
      distance: (indoor?.distance ?? 0) + outdoor.distance,
      duration: (indoor?.duration ?? 0) + outdoor.duration
    };
  })));
  return candidates.reduce((best, route) => route.distance < best.distance ? route : best);
}
