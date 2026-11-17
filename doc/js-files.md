# JavaScript file guide

Most app code is in `client/src/`.

| File | What it does |
| --- | --- |
| `index.js` | Starts the map, location tracking, and search. |
| `map.js` | Sets up the map, campus border, markers, and popups. |
| `search.js` | Handles search, map clicks, building selection, and recent searches. Uses personal bookmark names, limits suggestions to 10, and retains the last matching suggestions when continued typing finds no matches. |
| `personalNames.js` | Matches bookmarks to buildings using `buildingId` or shared names/aliases. Builds searchable locations with personal display names without modifying shared building data. Includes personal pins that are not linked to buildings. |
| `buildings.js` | Loads Firestore buildings, converts GeoPoint centers/outlines into map coordinates, supports search aliases, checks boundaries, and highlights buildings while loading floor 1 on the main map. |
| `floorPlan.js` | Loads and caches `buildings/{buildingId}/floors/f{level}` from Firestore. Converts GeoPoint rooms or imported GeoJSON features into map geometry, draws room fills/outlines/labels, and ignores stale requests after selection changes. Also contains the older SVG renderer, which location details no longer uses. |
| `locationDetails.js` | Shows location details, manages saved pins and the draggable panel, and builds the floor selector from `floorLevels`. Keeps pin popups and the selected title synchronized with bookmark renames/removals. Floor changes and saved-location selections display floorplans on the main map. |
| `location.js` | Shows the user's location and compass direction. |
| `washrooms.js` | Reads the top-level Firestore `washrooms` collection and places circular washroom icons at GeoPoint `location` coordinates. Matches `buildingId` and `floorId`; defaults every building to `f1` and updates the selected building when its floor changes. |
| `bookmarks.js` | Loads, saves, renames, and removes the signed-in user's bookmarks. Caches bookmark names and coordinates, synchronizes bookmark icons, and supplies the shared pencil/editor UI for the bookmark menu and location panel. |
| `homeAuth.js` | Updates the login button and handles logout. |
| `login.js` | Handles login and account creation. |
| `firebaseConfig.js` | Connects the app to Firebase Auth and Firestore. |

Other JavaScript files:

| File | What it does |
| --- | --- |
| `server/src/index.js` | Starts the server and serves pages and data files. |
| `server/scripts/import-rooms.js` | Validates room GeoJSON and imports it into a Firestore floor document with Firebase Admin credentials. Supports custom building/floor/file/project options and a dry run. Stores nested coordinates as JSON strings. See [import instructions](../server/scripts/README.md) for Windows, macOS, and Linux setup. |
| `vite.config.js` | Configures Vite for running and building the client. |