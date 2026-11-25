import { collection, getDocs } from "firebase/firestore";
import { Marker, Popup } from "maplibre-gl";
import { db } from "./firebaseConfig.js";
import { enablePinHold } from "./mobileInteractions.js";

const mapStates = new WeakMap();
const washroomIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
  <circle cx="7" cy="4" r="2"/><circle cx="17" cy="4" r="2"/>
  <path d="M4 7h6v7H8.5v7h-3v-7H4zM15 7h4l3 9h-3.5v5h-3v-5H12z"/>
</svg>`;
const diningIcons = {
  cafe: new URL("/img/cafe-icon.svg", import.meta.url).href,
  restaurant: new URL("/img/restaurant-icon.svg", import.meta.url).href,
};

function stateFor(map) {
  if (!mapStates.has(map)) {
    mapStates.set(map, {
      records: [], buildingId: null, floorId: "f1", defaultFloorId: "f1", enabled: new Set(),
    });
  }
  return mapStates.get(map);
}

export function setMapFilter(map, type, enabled) {
  const state = stateFor(map);
  if (enabled) state.enabled.add(type);
  else state.enabled.delete(type);
  renderVisibility(state);
}

export function setDefaultFilterFloor(map, level) {
  const state = stateFor(map);
  state.defaultFloorId = `f${level}`;
  renderVisibility(state);
}

export function updateMapFilterVisibility(map, buildingId = null, level = 1) {
  const state = stateFor(map);
  state.buildingId = buildingId;
  state.floorId = `f${level}`;
  renderVisibility(state);
}

function renderVisibility(state) {
  const diningAtLocation = new Map();
  for (const record of state.records) {
    const floorId = record.buildingId === state.buildingId ? state.floorId : state.defaultFloorId;
    const filter = record.type === "washroom" ? "washroom" : "dining";
    const hidden = !state.enabled.has(filter) || (record.floorId != null && record.floorId !== floorId);
    record.marker.getElement().hidden = hidden;
    if (hidden && record.marker.getPopup()?.isOpen()) record.marker.togglePopup();
    if (!hidden && record.type !== "washroom") {
      const key = record.marker.getLngLat().toArray().join(",");
      if (!diningAtLocation.has(key)) diningAtLocation.set(key, []);
      diningAtLocation.get(key).push(record.marker);
    }
  }
  for (const markers of diningAtLocation.values()) {
    markers.forEach((marker, index) => marker.setOffset([(index - (markers.length - 1) / 2) * 34, 0]));
  }
}

function createMarker(record, type, coordinates) {
  const isWashroom = type === "washroom";
  const element = document.createElement("button");
  const label = [record.name || `Washroom ${record.roomId || ""}`, record.category,
    record.buildingId.toUpperCase(), record.floorId]
    .filter(Boolean).join(" · ");
  element.className = isWashroom ? "washroom-marker" : "dining-marker";
  element.hidden = true;
  element.type = "button";
  element.title = label;
  element.setAttribute("aria-label", label);
  if (isWashroom) {
    element.innerHTML = washroomIcon;
  } else {
    const icon = document.createElement("img");
    icon.src = diningIcons[type];
    icon.alt = "";
    icon.width = 18;
    icon.height = 18;
    element.append(icon);
  }

  const marker = new Marker({ element, anchor: "center" }).setLngLat(coordinates);
  marker.setPopup(new Popup({
    offset: 18, focusAfterOpen: false, className: "filter-pin-popup",
  }).setText(label));
  enablePinHold(element, () => {
    if (!marker.getPopup().isOpen()) marker.togglePopup();
  });
  element.addEventListener("keypress", event => event.stopImmediatePropagation(), true);
  element.addEventListener("click", event => {
    event.stopPropagation();
    marker.togglePopup();
  });
  return marker;
}

// Load each collection independently so one failed read cannot hide the other.
export function setupMapFilters(campusMap) {
  return Promise.all(["washrooms", "dining"].map(name => loadMarkers(campusMap, name)));
}

async function loadMarkers({ map, mapReady, trackPopup }, collectionName) {
  const state = stateFor(map);
  try {
    const [snapshot] = await Promise.all([getDocs(collection(db, collectionName)), mapReady]);
    for (const record of state.records) {
      if (record.collectionName === collectionName) record.marker.remove();
    }
    state.records = state.records.filter(record => record.collectionName !== collectionName);
    snapshot.forEach(doc => {
      const record = doc.data();
      const type = collectionName === "washrooms" ? "washroom" : record.type;
      const { latitude, longitude } = record.location ?? {};
      if (typeof record.buildingId !== "string"
          || (type === "washroom" && typeof record.floorId !== "string")
          || (collectionName === "dining" && (!Object.hasOwn(diningIcons, type)
            || typeof record.name !== "string" || !record.name.trim()
            || (record.floorId != null && typeof record.floorId !== "string")))
          || !Number.isFinite(latitude) || !Number.isFinite(longitude)
          || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        console.warn(`Skipping invalid map marker ${doc.ref.path}`);
        return;
      }
      const marker = createMarker(record, type, [longitude, latitude]).addTo(map);
      const popup = marker.getPopup();
      popup.on("open", () => map.fire("filterpinopen"));
      trackPopup(popup);
      state.records.push({ collectionName, type, buildingId: record.buildingId, floorId: record.floorId, marker });
    });
    renderVisibility(state);
  } catch (error) {
    console.error(`Could not load ${collectionName} from Firebase:`, error);
  }
}
