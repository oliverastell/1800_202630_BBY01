import { readFile, stat } from "node:fs/promises";
import { parseArgs } from "node:util";

// Load the same project ID used by the client, without requiring a .env file.
try {
  process.loadEnvFile(new URL("../../.env", import.meta.url));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: "string" },
      building: { type: "string", default: "sw1" },
      floor: { type: "string", default: "f1" },
      project: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const building = values.building;
  const floor = values.floor;
  if (!/^[a-z0-9_-]+$/i.test(building) || !/^f\d+$/.test(floor)) {
    throw new Error("Use a building ID such as sw1 and a floor ID such as f1.");
  }
  const level = Number(floor.slice(1));
  const source = values.file ?? new URL("../data/sw1f1-rooms.geojson", import.meta.url);
  const geojson = JSON.parse(await readFile(source, "utf8"));
  if (geojson.type !== "FeatureCollection" || !geojson.features?.length) {
    throw new Error("Expected a nonempty GeoJSON FeatureCollection.");
  }
  const features = geojson.features.map((feature, index) => {
    if (feature.type !== "Feature" || !feature.properties ||
        feature.properties.building !== building || feature.properties.level !== level) {
      throw new Error(`Feature ${index} must belong to ${building}, level ${level}.`);
    }
    const geometry = feature.geometry;
    if (!["Polygon", "Point"].includes(geometry?.type) || !Array.isArray(geometry.coordinates)) {
      throw new Error(`Feature ${index} must have Polygon or Point coordinates.`);
    }
    // Firestore cannot store arrays directly inside arrays. Keep exact GeoJSON
    // coordinates as JSON; JSON.parse restores them when displaying the map.
    return {
      ...feature,
      geometry: { ...geometry, coordinates: JSON.stringify(geometry.coordinates) },
    };
  });
  const data = {
    building,
    level,
    type: geojson.type,
    name: geojson.name ?? `${building}${floor}-rooms`,
    featureCount: features.length,
    features,
  };
  const bytes = Buffer.byteLength(JSON.stringify(data));
  // Leave room for Firestore field-name overhead and existing document fields.
  if (bytes > 800_000) throw new Error("Floor data is too large for one Firestore document.");
  const path = `buildings/${building}/floors/${floor}`;
  const projectId = values.project ?? process.env.GOOGLE_CLOUD_PROJECT ?? process.env.VITE_FIREBASE_PROJECT_ID;
  console.log(JSON.stringify({ projectId, path, featureCount: features.length, bytes, dryRun: values["dry-run"] }, null, 2));
  if (values["dry-run"]) return;
  if (!projectId) throw new Error("Set VITE_FIREBASE_PROJECT_ID or pass --project <project-id>.");

  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credentialPath) {
    const credentialFile = await stat(credentialPath).catch(() => null);
    if (!credentialFile?.isFile()) {
      throw new Error(
        `Credential file does not exist: ${credentialPath}. ` +
        "Set GOOGLE_APPLICATION_CREDENTIALS to your downloaded Firebase service-account JSON file. " +
        "C:\\private\\firebase-service-account.json in the instructions is only an example path.",
      );
    }
  }

  const { initializeApp, applicationDefault, deleteApp } = await import("firebase-admin/app");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  const credential = applicationDefault();
  // Resolve credentials before starting Firestore's background connection setup.
  await credential.getAccessToken();
  const app = initializeApp({ credential, projectId });
  try {
    const db = getFirestore(app);
    const batch = db.batch();
    batch.set(db.doc(`buildings/${building}`), { buildingId: building }, { merge: true });
    batch.set(db.doc(path), { ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await batch.commit();
    console.log(`Imported ${features.length} features into ${path}.`);
  } finally {
    await deleteApp(app);
  }
}

main().catch((error) => {
  console.error(`Import failed: ${error.message}`);
  process.exitCode = 1;
});
