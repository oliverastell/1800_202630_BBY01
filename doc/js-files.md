# JavaScript file guide

Most app code is in `client/src/`.

| File | What it does |
| --- | --- |
| `index.js` | Starts the map, location tracking, and search. |
| `map.js` | Sets up the map, campus border, markers, and popups. |
| `search.js` | Handles search, map clicks, building selection, and recent searches. |
| `buildings.js` | Loads Firestore buildings, converts GeoPoint centers/outlines into map coordinates, supports search aliases, checks boundaries, and highlights buildings while loading floor 1 on the main map. |
| `floorPlan.js` | Loads and caches `buildings/{buildingId}/floors/f{level}` from Firestore. Converts GeoPoint rooms or imported GeoJSON features into map geometry, draws room fills/outlines/labels, and ignores stale requests after selection changes. Also contains the older SVG renderer, which location details no longer uses. |
| `locationDetails.js` | Shows location details, manages selected-location bookmarks and the draggable details panel, and builds the floor selector from `floorLevels`. Floor changes and saved-location selections display floorplans on the main map. |
| `location.js` | Shows the user's location and compass direction. |
| `bookmarks.js` | Saves, removes, and displays bookmarked searches. |
| `homeAuth.js` | Updates the login button and handles logout. |
| `login.js` | Handles login and account creation. |
| `firebaseConfig.js` | Connects the app to Firebase Auth and Firestore. |

Other JavaScript files:

| File | What it does |
| --- | --- |
| `server/src/index.js` | Starts the server and serves pages and data files. |
| `server/scripts/import-rooms.js` | Validates room GeoJSON and imports it into a Firestore floor document with Firebase Admin credentials. Supports custom building/floor/file/project options and a dry run. Stores nested coordinates as JSON strings. See [import instructions](../server/scripts/README.md) for Windows, macOS, and Linux setup. |
| `vite.config.js` | Configures Vite for running and building the client. |

## Floorplan data flow

Clicking or searching for a building loads its first floor from Firestore and
draws rooms at their geographic coordinates on the main map. Opening a bookmark
finds the building using the saved coordinates and follows the same display path.
The location details floor button lists the building's numeric `floorLevels`;
choosing a level loads its `f{level}` document. There is no separate floorplan
view in location details.

Building documents use `name`, `searchNames`, `center`, `outline`, and
`floorLevels`. The building loader also accepts older array coordinates and
`polygon` data. Floor documents can contain either a `rooms` array (GeoPoint
centers and polygon points) or the import script's `features` array (GeoJSON with
JSON-encoded coordinates). When both exist, `rooms` takes priority. Successful
floor reads are cached for the page session; failed reads can be retried.
