# Import floor shapes into Firestore

## Prerequisites (all platforms)

Use Node.js 22 or later and npm. Run commands from the project root (the folder
containing `package.json`), not from `server/scripts/`. Check your installation:

```sh
node --version
npm --version
npm install
```

Real imports also require `firebase-admin`. It is currently not listed in
`package.json`; install it locally before importing:

```sh
npm install --no-save firebase-admin
```

Have your room GeoJSON file ready. The default path is
`server/data/sw1f1-rooms.geojson`, but that file may not be included in your
checkout. If it is missing, supply your own file with `--file` (examples below).

## Preview before importing

Preview the import (no credentials or database writes required):

```powershell
npm run import:rooms -- --dry-run
```

This command works in PowerShell, macOS Terminal (zsh), and Linux (bash).
For a file stored elsewhere, quote paths that contain spaces:

```sh
npm run import:rooms -- --file "/path/to/room data/sw1f1-rooms.geojson" --dry-run
```

The preview prints the project ID, destination document path, feature count,
and estimated payload size. Confirm these before running without `--dry-run`.

## Credentials and real imports

For a real import, set up a Firebase Admin service-account key with Firestore
write access. In Firebase Console, open Project settings > Service accounts >
Generate new private key and save the downloaded JSON file outside this repository.
Replace the example path below with the actual location of that downloaded file;
the script does not create a credential file. The client Firebase API key
does not grant Admin access. Do not commit the downloaded private key or share it
in chat. These credentials grant server access to Firestore.

### Windows PowerShell

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\private\firebase-service-account.json"
npm run import:rooms
```

### macOS and Linux (zsh/bash)

Use the actual path to your downloaded service-account file. `$HOME` expands to
your home directory; use it instead of putting `~` inside quotes.

```sh
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/firebase/firebase-service-account.json"
test -f "$GOOGLE_APPLICATION_CREDENTIALS" && echo "Credential file found"
npm run import:rooms -- --file "$HOME/Downloads/sw1f1-rooms.geojson" --project your-firebase-project-id --dry-run
npm run import:rooms -- --file "$HOME/Downloads/sw1f1-rooms.geojson" --project your-firebase-project-id
```

The `export` applies to the current terminal session. Set it again in a new
terminal, or set it for just one command:

```sh
GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/firebase/firebase-service-account.json" npm run import:rooms -- --file "$HOME/Downloads/sw1f1-rooms.geojson" --project your-firebase-project-id
```

To clear the variable afterward, use `unset GOOGLE_APPLICATION_CREDENTIALS`
on macOS/Linux or `Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS` in PowerShell.

### Project selection

The project ID defaults to `GOOGLE_CLOUD_PROJECT`, then
`VITE_FIREBASE_PROJECT_ID` in the root `.env`. You can override it explicitly:

```powershell
npm run import:rooms -- --project your-firebase-project-id
```

Alternatively, in macOS/Linux set `export GOOGLE_CLOUD_PROJECT="your-firebase-project-id"`;
in PowerShell set `$env:GOOGLE_CLOUD_PROJECT = "your-firebase-project-id"`.
The explicit `--project` option takes priority over both environment variables.

## Stored data and app behavior

The default input is `server/data/sw1f1-rooms.geojson`. The script atomically
creates/updates `buildings/sw1` and `buildings/sw1/floors/f1`. The floor contains
`building`, `level`, `type`, `name`, `featureCount`, `features`, and `updatedAt`.
All 273 source features (including points) are retained with their properties.
Each feature's `geometry.coordinates` is a JSON string because Firestore cannot
store nested arrays. Restore GeoJSON for MapLibre after reading the document:

```js
const floor = snapshot.data();
const geojson = {
  type: floor.type,
  features: floor.features.map((feature) => ({
    ...feature,
    geometry: {
      ...feature.geometry,
      coordinates: JSON.parse(feature.geometry.coordinates),
    },
  })),
};
```

The app's `client/src/floorPlan.js` already decodes this format. It also supports
the newer `rooms` array with GeoPoint `center` and `points` fields. This importer
writes `features`, not `rooms`; if a floor document contains both, the app prefers
`rooms`, so importing features will not update the displayed rooms data.

The importer only sets `buildingId` on the parent building. Add its `name`,
`searchNames` array, GeoPoint `center`, GeoPoint `outline` array, and numeric
`floorLevels` array separately so the app can find and display the building.
Selecting a building displays floor 1 on the main map; the floor button lists
`floorLevels` and loads `buildings/{buildingId}/floors/f{level}`.

## Import another building or floor

Re-running replaces the floor's features array and refreshes its metadata;
unrelated document fields and other floors are preserved. For another floor:

```powershell
npm run import:rooms -- --file server/data/sw1f2-rooms.geojson --building sw1 --floor f2
```

The same command works on macOS/Linux. For another building:

```sh
npm run import:rooms -- --file "/path/to/se2f1-rooms.geojson" --building se2 --floor f1 --project your-firebase-project-id --dry-run
```

After reviewing the preview, remove `--dry-run` to write. Each source feature
must have matching `properties.building` (for example, `"se2"`) and numeric
`properties.level` (for example, `1`). Coordinates use GeoJSON order:
`[longitude, latitude]`. Supported geometry types are `Polygon` and `Point`.
Update the parent building's `floorLevels` when adding another floor.

The importer validates that each feature belongs to the requested building and
level, and rejects oversized input before writing.

## Troubleshooting

| Message or symptom | What to check |
| --- | --- |
| `node` or `npm` not found | Install Node.js and reopen the terminal. |
| `process.loadEnvFile` is unavailable | Use Node.js 22 or later. |
| `ENOENT` reading the input | The default GeoJSON file is absent, or `--file` points to the wrong location. Relative paths are resolved from your current directory. |
| Credential file does not exist | Replace the example credential path with your downloaded JSON file; check capitalization on Linux. |
| Cannot find package `firebase-admin` | Run `npm install --no-save firebase-admin` from the project root. |
| Missing project ID | Pass `--project` or set one of the project environment variables above. |
| Authentication or permission error | Check the service-account key, its Firestore write permissions, and the target project. A successful dry run does not verify credentials. |
| Feature belongs to another building/level | Match `--building` and `--floor` to every feature's properties. |
| Floor data is too large | The script rejects payloads over 800,000 estimated bytes; reduce the input size before retrying. |
| Import succeeds but no floor appears | Check parent building fields, `floorLevels`, client Firestore read permissions, and whether an older `rooms` field overrides imported `features`. Refresh the page to clear the app's floor cache. |
