import { db } from "./firebaseConfig.js";
import { collection, getDocs } from "firebase/firestore";

export const buildings = [];

export async function loadBuildings() {
  const snap = await getDocs(collection(db, "buildings"));
  const loaded = [];
  snap.forEach(d => {
    const b = d.data();
    try {
      const border = typeof b.polygon === "string" ? JSON.parse(b.polygon) : b.polygon;
      const isCoordinate = point => Array.isArray(point) && point.length === 2
        && point.every(Number.isFinite) && Math.abs(point[0]) <= 90
        && Math.abs(point[1]) <= 180;
      if (typeof b.name !== "string" || !b.name.trim()
          || !isCoordinate(b.center)
          || !Array.isArray(border) || border.length < 3 || !border.every(isCoordinate)) {
        throw new Error("Invalid building fields or coordinates");
      }
      loaded.push({ ...b, searchNames: typeof b.searchNames === "string" ? b.searchNames : "", id: d.id, border });
    } catch (error) {
      console.warn(`Skipping invalid building ${d.id}:`, error);
    }
  });
  buildings.splice(0, buildings.length, ...loaded);
  return buildings;
}

// Call after the map loads. Firestore stores coordinates as [latitude, longitude].
// Both map clicks and searches use this function to replace the selected building.
export function highlightBuilding(map, building) {
  const sourceId = "selected-building";
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });
    map.addLayer({
      id: "selected-building-fill", type: "fill", source: sourceId,
      filter: ["==", "$type", "Polygon"],
      paint: { "fill-color": "#1677ff", "fill-opacity": 0.35 }
    });
    map.addLayer({
      id: "selected-building-outline", type: "line", source: sourceId,
      filter: ["==", "$type", "Polygon"],
      paint: { "line-color": "#0057b8", "line-width": 3 }
    });
    map.addLayer({
      id: "selected-building-name", type: "symbol", source: sourceId,
      filter: ["==", "$type", "Point"],
      layout: {
        "text-field": ["get", "name"], "text-size": 18,
        "text-allow-overlap": true
      },
      paint: { "text-color": "#003a70", "text-halo-color": "#ffffff", "text-halo-width": 2 }
    });
  }

  const features = [];
  if (building) {
    const ring = building.border.map(([lat, lng]) => [lng, lat]);
    if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) {
      ring.push([...ring[0]]);
    }
    features.push({
      type: "Feature", properties: { name: building.name },
      geometry: { type: "Polygon", coordinates: [ring] }
    }, {
      type: "Feature", properties: { name: building.name },
      geometry: { type: "Point", coordinates: [building.center[1], building.center[0]] }
    });
  }
  map.getSource(sourceId).setData({ type: "FeatureCollection", features });
  // Keep the selection above overlays that may have finished loading later.
  for (const id of ["selected-building-fill", "selected-building-outline", "selected-building-name"]) {
    map.moveLayer(id);
  }
}

export const toLngLat = ([lat, lng]) => [lng, lat];

export function isInside([lat, lng], border) {
    if (!border || border.length < 3) return false

    let isInside = false
    for (let i = 0, j = border.length - 1; i < border.length; j = i++) {
        const [latI, lngI] = border[i]
        const [latJ, lngJ] = border[j]
        if ((latI > lat) !== (latJ > lat) &&
            lng < (lngJ - lngI) * (lat - latI) / (latJ - latI) + lngI) {
            isInside = !isInside
        }
    }
    return isInside
}

export function findBuildingAt(latlng) {
  return buildings.find(b => isInside([latlng.lat, latlng.lng], b.border));
}


export function findBuildingByText(text) {
  const t = text.toLowerCase().trim();
  if (!t) return;
  const names = b => [b.id, b.name, b.searchNames].map(n => n.toLowerCase().trim());
  return buildings.find(b => names(b).includes(t))
      || buildings.find(b => names(b).some(n => n.includes(t)));
}
