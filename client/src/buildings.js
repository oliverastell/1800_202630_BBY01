import { db } from "./firebaseConfig.js";
import { collection, getDocs } from "firebase/firestore";

export const buildings = [];

export async function loadBuildings() {
  const snap = await getDocs(collection(db, "buildings"));
  const loaded = [];
  snap.forEach(d => {
    const b = d.data();
    try {
      const border = JSON.parse(b.polygon);
      const isCoordinate = point => Array.isArray(point) && point.length === 2
        && point.every(Number.isFinite) && Math.abs(point[0]) <= 90
        && Math.abs(point[1]) <= 180;
      if (typeof b.name !== "string" || !b.name.trim()
          || typeof b.searchNames !== "string" || !isCoordinate(b.center)
          || !Array.isArray(border) || border.length < 3 || !border.every(isCoordinate)) {
        throw new Error("Invalid building fields or coordinates");
      }
      loaded.push({ ...b, id: d.id, border });
    } catch (error) {
      console.warn(`Skipping invalid building ${d.id}:`, error);
    }
  });
  buildings.splice(0, buildings.length, ...loaded);
  return buildings;
}
