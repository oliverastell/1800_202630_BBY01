# JavaScript file guide

Most app code is in `../src`.

| File | What it does |
| --- | --- |
| `index.js` | Starts the map, location tracking, and search. |
| `map.js` | Sets up the map, campus border, markers, and popups. |
| `search.js` | Handles search, map clicks, building selection, and recent searches. Uses personal bookmark names, limits suggestions to 10, and retains the last matching suggestions when continued typing finds no matches. Holding or clicking inside a building drops the pin at that spot, or on the room under it on the shown floor (corridors, lobbies, and atriums are skipped). |
| `backButton.js` | Makes the browser/Android back button close the open search sheet, location details, or pin popup instead of leaving the map. Adds one history entry while something is open. |
| `bookmarkNames.js` | Matches bookmarks to buildings using `buildingId` or shared names/aliases. Builds searchable locations with personal display names without modifying shared building data. Includes personal pins that are not linked to buildings. |
| `buildings.js` | Loads Firestore buildings, converts GeoPoint centers/outlines into map coordinates, supports search aliases, checks boundaries, and highlights buildings while loading floor 1 on the main map. |
| `floorPlan.js` | Loads and caches `buildings/{buildingId}/floors/f{level}` from Firestore. Converts GeoPoint rooms or imported GeoJSON features into map geometry, draws room fills/outlines/labels, and ignores stale requests after selection changes. Provides `roomAnchor()`, which places a room's pin at the point deepest inside the room (where its number is drawn). Also contains the older SVG renderer, which location details no longer uses. |
| `locationDetails.js` | Shows location details, manages saved pins and the draggable panel, and builds the floor selector from `floorLevels`. Keeps pin popups and the selected title synchronized with bookmark renames/removals. Floor changes and saved-location selections display floorplans on the main map. |
| `location.js` | Shows the user's location and compass direction. |
| `mapFilters.js` | Reads Firestore `washrooms` and `dining` and displays markers for the enabled filters. Floor-specific markers follow the selected or default floor. Dining venues with an unknown floor remain visible on all floors. Clicking (or holding, on touch) a filter pin opens it in the location details sheet with its type, building, and floor. |
| `bookmarks.js` | Loads, saves, renames, and removes the signed-in user's bookmarks. Caches bookmark names and coordinates, synchronizes bookmark icons, and supplies the shared pencil/editor UI for the bookmark menu and location panel. |
| `homeAuth.js` | Updates the login button and handles logout. |
| `login.js` | Handles login and account creation. Replaces the login page in history after signing in, so back does not return to it. |
| `welcome.js` | Welcome page buttons: go to login or skip to the map. Records when the welcome page was last seen. |
| `redirectToWelcome.js` | Sends signed-out users to the welcome page unless they saw it within the last 60 minutes. |
| `alerts.js` | Shared SweetAlert2 dialogs: confirm an action, rename something, and show an error. |
| `mobileInteractions.js` | Touch helpers: hold the map to drop a pin, pins that only respond to a long press, and detecting whether a click came from a recent touch. |
| `walkingRoute.js` | Finds a walking route between buildings using the Valhalla routing service, starting and ending at building entrances. Picks the shortest of the entrance combinations. |
| `recents.js` | Older recent-search loader. Not imported by any page (it imports a missing `authentication.js`); recent searches are handled in `search.js`. |
| `app.js` | Loads Bootstrap and the global stylesheet; included by every page. |
| `firebaseConfig.js` | Connects the app to Firebase Auth and Firestore. |

Other JavaScript files:

| File | What it does |
| --- | --- |
| `../tooling` | Starts the server and serves pages and data files. |
| `../tooling` | Validates room GeoJSON and imports it into a Firestore floor document with Firebase Admin credentials. Supports custom building/floor/file/project options and a dry run. Stores nested coordinates as JSON strings. See [import instructions](../tooling/README.md) for Windows, macOS, and Linux setup. |
| `vite.config.js` | Configures Vite for running and building the client. |
