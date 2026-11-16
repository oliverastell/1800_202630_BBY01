import { collection, getDocs } from "firebase/firestore";
import { Marker } from "maplibre-gl";
import { db } from "./firebaseConfig.js";

const mapStates = new WeakMap();
const washroomIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
  <circle cx="7" cy="4" r="2"/><circle cx="17" cy="4" r="2"/>
  <path d="M4 7h6v7H8.5v7h-3v-7H4zM15 7h4l3 9h-3.5v5h-3v-5H12z"/>
</svg>`;

function stateFor(map) {
  if (!mapStates.has(map)) mapStates.set(map, { records: [], buildingId: null, floorId: "f1", enabled: false });
  return mapStates.get(map);
}

export function setWashroomFilter(map, enabled) {
  const state = stateFor(map);
  state.enabled = enabled;
  updateWashroomVisibility(map, state.buildingId, Number(state.floorId.slice(1)));
}

export function updateWashroomVisibility(map, buildingId = null, level = 1) {
  const state = stateFor(map);
  state.buildingId = buildingId;
  state.floorId = `f${level}`;
  for (const record of state.records) {
    const floorId = record.buildingId === buildingId ? state.floorId : "f1";
    record.marker.getElement().hidden = !state.enabled || record.floorId !== floorId;
  }
}

// Load all buildings' washrooms once; floor changes only update visibility.
export async function setupWashrooms({ map, mapReady }) {
  const state = stateFor(map);
  try {
    const [snapshot] = await Promise.all([getDocs(collection(db, "washrooms")), mapReady]);
    for (const record of state.records) record.marker.remove();
    state.records = [];
    snapshot.forEach(washroomDoc => {
      const washroom = washroomDoc.data();
      const { latitude, longitude } = washroom.location ?? {};
      if (typeof washroom.buildingId !== "string" || typeof washroom.floorId !== "string"
          || !Number.isFinite(latitude) || !Number.isFinite(longitude)
          || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        console.warn(`Skipping washroom ${washroomDoc.id}: invalid building, floor, or location`);
        return;
      }
      const element = document.createElement("div");
      element.className = "washroom-marker";
      element.hidden = true;
      const label = [washroom.name || `Washroom ${washroom.roomId || ""}`,
        washroom.category, washroom.buildingId.toUpperCase(), washroom.floorId].filter(Boolean).join(" · ");
      element.title = label;
      element.setAttribute("role", "img");
      element.setAttribute("aria-label", label);
      element.innerHTML = washroomIcon;
      const marker = new Marker({ element, anchor: "center" })
        .setLngLat([longitude, latitude]).addTo(map);
      state.records.push({ buildingId: washroom.buildingId, floorId: washroom.floorId, marker });
    });
    updateWashroomVisibility(map, state.buildingId, Number(state.floorId.slice(1)));
  } catch (error) {
    console.error("Could not load washrooms from Firebase:", error);
  }
}
