import { db } from "./firebaseConfig.js";
import { doc, getDoc } from "firebase/firestore";
import { updateWashroomVisibility } from "./washrooms.js";

const pendingFloors = new Map();
const svgNS = "http://www.w3.org/2000/svg";
const mapSelections = new WeakMap();

// Display the selected building's first floor in its geographic position.
export async function showBuildingFloor(map, building, level = 1) {
  updateWashroomVisibility(map, building?.id ?? null, level);
  const selection = {};
  mapSelections.set(map, selection);
  const sourceId = "building-floor-rooms";
  const empty = { type: "FeatureCollection", features: [] };
  map.getSource(sourceId)?.setData(empty);
  if (!building || (Array.isArray(building.floorLevels) && !building.floorLevels.includes(level))) return;
  try {
    const features = await loadFloorFeatures(building.id, level);
    if (mapSelections.get(map) !== selection) return;
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: "geojson", data: empty });
      map.addLayer({
        id: "building-floor-fill", type: "fill", source: sourceId,
        filter: ["==", "$type", "Polygon"],
        paint: { "fill-color": "#f4f0df", "fill-opacity": 0.9 }
      });
      map.addLayer({
        id: "building-floor-outline", type: "line", source: sourceId,
        filter: ["==", "$type", "Polygon"],
        paint: { "line-color": "#526675", "line-width": 1 }
      });
      map.addLayer({
        id: "building-floor-labels", type: "symbol", source: sourceId,
        layout: { "text-field": ["get", "name"], "text-size": 10 },
        paint: { "text-color": "#243746", "text-halo-color": "#ffffff", "text-halo-width": 1 }
      });
    }
    map.getSource(sourceId).setData({ type: "FeatureCollection", features });
    for (const id of ["building-floor-fill", "building-floor-outline", "building-floor-labels"]) map.moveLayer(id);
  } catch (error) {
    if (mapSelections.get(map) === selection) console.error(`Could not load ${building.id} floor on map:`, error);
  }
}

// Floor plan
export function loadFloorFeatures(buildingId, level) {
  const key = `${buildingId}/f${level}`;
  if (!pendingFloors.has(key)) {
    pendingFloors.set(key, getDoc(doc(db, "buildings", buildingId, "floors", `f${level}`)).then(snapshot => {
      if (!snapshot.exists()) throw new Error("Floor plan is unavailable");
      const data = snapshot.data();
      // Existing imports store GeoJSON features with JSON-encoded coordinates.
      // Prefer the rooms schema when present, and support those earlier imports.
      if (!Array.isArray(data.rooms) && Array.isArray(data.features)) {
        const features = data.features.map(feature => ({
          ...feature,
          properties: { ...feature.properties, building: buildingId, level },
          geometry: {
            ...feature.geometry,
            coordinates: typeof feature.geometry?.coordinates === "string"
              ? JSON.parse(feature.geometry.coordinates) : feature.geometry?.coordinates
          }
        })).filter(feature => ["Point", "Polygon"].includes(feature.geometry.type)
          && Array.isArray(feature.geometry.coordinates) && feature.geometry.coordinates.length);
        if (!features.length) throw new Error("Floor document has no room geometry");
        return features;
      }
      const isPoint = point => Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude)
        && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
      const coordinate = point => [point.longitude, point.latitude];
      const features = (data.rooms ?? []).flatMap(room => {
        let geometry;
        if (room.hasShape && Array.isArray(room.points) && room.points.length >= 3 && room.points.every(isPoint)) {
          const ring = room.points.map(coordinate);
          if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) ring.push([...ring[0]]);
          geometry = { type: "Polygon", coordinates: [ring] };
        } else if (isPoint(room.center)) {
          geometry = { type: "Point", coordinates: coordinate(room.center) };
        } else return [];
        return [{ type: "Feature", properties: { name: room.name, kind: room.kind, use: room.use, building: buildingId, level }, geometry }];
      });
      if (!features.length) throw new Error("Floor document has no valid rooms or room coordinates");
      return features;
    }).catch(error => {
      pendingFloors.delete(key);
      throw error;
    }));
  }
  return pendingFloors.get(key);
}

export function renderFloorPlan(container, features) {
  const positions = features.flatMap(feature => {
    const coordinates = feature.geometry?.coordinates;
    if (feature.geometry?.type === "Point") return [coordinates];
    if (feature.geometry?.type === "Polygon") return coordinates.flat();
    return [];
  });
  if (!positions.length) throw new Error("Floor plan has no geometry");

  const longitude = positions.map(point => point[0]);
  const latitude = positions.map(point => point[1]);
  const minLng = Math.min(...longitude);
  const minLat = Math.min(...latitude);
  const maxLat = Math.max(...latitude);
  const scale = 1000000;
  const longitudeScale = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const project = ([lng, lat]) => [
    (lng - minLng) * longitudeScale * scale + 18,
    (maxLat - lat) * scale + 18
  ];
  const width = (Math.max(...longitude) - minLng) * longitudeScale * scale + 36;
  const height = (maxLat - minLat) * scale + 36;
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${features[0]?.properties?.building ?? "Building"} first floor plan with room and area labels`);
  svg.classList.add("floor-plan-svg", "d-block", "h-auto");

  const labels = [];
  features.forEach((feature, index) => {
    const { geometry, properties = {} } = feature;
    if (geometry?.type === "Polygon") {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", geometry.coordinates.map(ring =>
        ring.map((point, pointIndex) => {
          const [x, y] = project(point);
          return `${pointIndex ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
        }).join(" ") + " Z"
      ).join(" "));
      path.setAttribute("class", "floor-plan-area");
      path.dataset.featureIndex = index;
      const title = document.createElementNS(svgNS, "title");
      title.textContent = [properties.name, properties.use || properties.kind].filter(Boolean).join(" · ");
      path.append(title);
      svg.append(path);
      if (properties.name) {
        const outline = geometry.coordinates[0].map(project);
        const left = Math.min(...outline.map(point => point[0]));
        const right = Math.max(...outline.map(point => point[0]));
        const top = Math.min(...outline.map(point => point[1]));
        const bottom = Math.max(...outline.map(point => point[1]));
        if (right - left >= 12 && bottom - top >= 8) {
          const label = document.createElementNS(svgNS, "text");
          label.setAttribute("x", (left + right) / 2);
          label.setAttribute("y", (top + bottom) / 2);
          label.setAttribute("class", "floor-plan-label");
          label.dataset.featureIndex = index;
          label.textContent = properties.name;
          labels.push(label);
        }
      }
    } else if (geometry?.type === "Point" && properties.name) {
      const [x, y] = project(geometry.coordinates);
      const label = document.createElementNS(svgNS, "text");
      label.setAttribute("x", x);
      label.setAttribute("y", y);
      label.setAttribute("class", "floor-plan-label");
      label.dataset.featureIndex = index;
      label.textContent = properties.name;
      labels.push(label);
    }
  });
  svg.append(...labels);
  container.replaceChildren(svg);
}
