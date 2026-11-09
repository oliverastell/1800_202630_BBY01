# JavaScript file guide

Most app code is in `client/src/`.

| File | What it does |
| --- | --- |
| `index.js` | Starts the map, location tracking, and search. |
| `map.js` | Sets up the map, campus border, markers, and popups. |
| `search.js` | Handles search, map clicks, building selection, and recent searches. |
| `buildings.js` | Loads buildings, checks building boundaries, and draws highlights. |
| `locationDetails.js` | Show each location details on search/tap |
| `location.js` | Shows the user's location and compass direction. |
| `bookmarks.js` | Saves, removes, and displays bookmarked searches. |
| `homeAuth.js` | Updates the login button and handles logout. |
| `login.js` | Handles login and account creation. |
| `firebaseConfig.js` | Connects the app to Firebase Auth and Firestore. |

Other JavaScript files:

| File | What it does |
| --- | --- |
| `server/src/index.js` | Starts the server and serves pages and data files. |
| `vite.config.js` | Configures Vite for running and building the client. |
