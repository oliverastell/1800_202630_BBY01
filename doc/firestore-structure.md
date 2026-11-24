# Firestore structure

This guide describes the schema used by the current JavaScript code, rather than
an export of the live database. Example names and coordinates are illustrative.

```text
buildings/{buildingId}                 Shared building information
  floors/{floorId}                     Rooms or imported floor geometry
washrooms/{washroomId}                 Shared washroom locations
dining/{venueId}                      Shared campus dining locations
users/{uid}
  bookmarks/{searchTarget}             Personal names and saved locations
  recentSearches/{searchTarget}        Personal search history
```

Building IDs are lowercase identifiers such as `sw1` or `sw9`. Floor IDs use
`f` followed by a numeric level, such as `f1`. A user's `uid` comes from Firebase
Authentication. The app does not currently create user profile fields on the
parent `users/{uid}` document; its subcollections can exist without that document.
Login credentials are managed by Firebase Authentication, not these collections.

## Buildings

Path: `buildings/{buildingId}`. Read by `client/src/buildings.js`.

| Field | Type | Purpose |
| --- | --- | --- |
| `name` | string | Required shared display name, for example `SW9`. |
| `type` | string, optional | Classification displayed in the map popup and location details. `parking` is displayed as Parking lot. |
| `details` | array of strings, optional | Additional lines displayed in the map popup and location details. An empty array hides the section. |
| `searchAliases` | array of strings | Shared alternative search terms. Defaults to an empty array. |
| `center` | GeoPoint | Required building center. Older `[latitude, longitude]` arrays are also accepted. |
| `outline` | array of GeoPoints or JSON string | Required footprint with at least three valid points. A JSON string can encode one ring or multiple footprint rings in `[latitude, longitude]` order. |
| `polygon` | same as `outline` | Older fallback used when `outline` is absent. |
| `floorLevels` | array of integers | Available floor levels, for example `[1, 2, 3, 4]`. The UI defaults to floor 1 when absent. |
| `entrances` | array of maps, optional | Each map has a `location` GeoPoint for a building entrance. Walking routes use valid entrances when available. |
| `buildingId` | string, optional | Written by the room importer; runtime identity comes from the document ID. |

Buildings without a valid name, center, or footprint are skipped. The loader
always includes levels 1–4 for `sw1`, including older records lacking those levels.
Personal bookmark renames never update this document or its shared aliases.

## Floors

Path: `buildings/{buildingId}/floors/f{level}`. Read by
`client/src/floorPlan.js`. Each floor is one document, not a room subcollection.
Two formats are supported; when `rooms` is an array, it takes priority over
`features`.

### Room format

The floor's `rooms` field is an array of maps:

| Room field | Type | Purpose |
| --- | --- | --- |
| `name` | string | Label displayed on the map. |
| `kind` | string, optional | Room/area classification. |
| `use` | string, optional | Description of the room's use. |
| `hasShape` | boolean | Enables polygon rendering when valid points exist. |
| `points` | array of GeoPoints | At least three points for a room polygon. The renderer closes the ring. |
| `center` | GeoPoint | Renders a point when a valid polygon is unavailable. |

Rooms without usable points or a valid center are skipped. GeoPoints are
converted to GeoJSON `[longitude, latitude]` coordinates for the map.

### Imported GeoJSON format

Written by `server/scripts/import-rooms.js`:

| Field | Type | Purpose |
| --- | --- | --- |
| `building` | string | Building document ID. |
| `level` | integer | Numeric floor level. |
| `type` | string | GeoJSON collection type. |
| `name` | string | Source collection name or generated import name. |
| `featureCount` | integer | Number of imported features. |
| `features` | array of maps | GeoJSON features with properties and geometry. |
| `updatedAt` | Firestore Timestamp | Server timestamp of the import. |

Each feature keeps its GeoJSON `type`, `properties`, and `geometry`. Within
`geometry`, `coordinates` is a **JSON string**, since Firestore does not support
arrays directly nested inside arrays. Coordinates use GeoJSON
`[longitude, latitude]` order. The reader parses the string and displays Point
and Polygon geometry. Imports merge fields into existing documents and add the
level to the parent building's `floorLevels`; they do not create its name,
center, or footprint. See [room import instructions](../server/scripts/README.md).

## Washrooms

Path: `washrooms/{washroomId}`. Read by `client/src/mapFilters.js`.

| Field | Type | Purpose |
| --- | --- | --- |
| `buildingId` | string | Required building ID, such as `sw1`. |
| `floorId` | string | Required floor ID, such as `f1`. |
| `location` | GeoPoint | Required marker position. |
| `name` | string, optional | Accessible marker label. |
| `roomId` | string, optional | Fallback room identifier for the label. |
| `category` | string, optional | Additional label information. |

The app reads all washrooms once. With the washroom filter enabled, it shows
the selected floor for the selected building and floor `f1` for other buildings.
Records with invalid building/floor identifiers or coordinates are skipped.

## Dining

Path: `dining/{venueId}`. Read by `client/src/mapFilters.js`.

| Field | Type | Purpose |
| --- | --- | --- |
| `name` | string | Venue name shown on the map. |
| `type` | string | `cafe` or `restaurant`. |
| `buildingId` | string | Building document ID. |
| `location` | GeoPoint | Marker position. |
| `floorId` | string, optional | Verified floor ID, such as `f1`. A venue with no floor appears on all floors. |

## Personal bookmarks

Path: `users/{uid}/bookmarks/{searchTarget}`. Managed by
`client/src/bookmarks.js`.

| Field | Type | Purpose |
| --- | --- | --- |
| `searchTarget` | string | Stable lowercase, trimmed location key. Also used as the document ID. |
| `name` | string | Current personal display name. |
| `displayText` | string | Mirrors `name` for compatibility; older bookmarks may have only this field. |
| `searchAliases` | array of strings | Contains only the current name, `[name]`. Replaced on every rename. |
| `buildingId` | string, optional | Links the bookmark to a shared building. |
| `latitude` | number, optional | Saved latitude; stored together with a valid longitude. |
| `longitude` | number, optional | Saved longitude. |
| `markedLocationNumber` | integer, optional | Original number for a `Marked location N` pin. Preserved on rename. |
| `createdAt` | string | Client-generated ISO 8601 creation time, not a Firestore Timestamp. |

Example personal bookmark:

```json
{
  "searchTarget": "sw9",
  "buildingId": "sw9",
  "name": "My classroom",
  "displayText": "My classroom",
  "searchAliases": ["My classroom"],
  "latitude": 49.25,
  "longitude": -123.0,
  "createdAt": "2026-11-17T12:00:00.000Z"
}
```

The stable key can be an original building name/alias or `marked location 1`;
it does not change when the personal name changes. Older building bookmarks
without `buildingId` are matched against the shared building ID, name, and
aliases. The UI prefers `name`, falling back to `displayText`.

`personalNames.js` combines the current cached bookmark name with shared building
aliases for search. Searching `SW9` can display `My classroom · SW9`. Renaming
to `Study spot` replaces both personal name fields and the personal aliases;
`My classroom` no longer matches, while shared terms such as `SW9` still work.
Suggestions, recents, bookmarks, and location details use the current personal
name. Personal pins without a building remain searchable by their current name
and original stable key. No shared document is changed by this operation.

## Recent searches

Path: `users/{uid}/recentSearches/{searchTarget}`. Managed by
`client/src/search.js`.

| Field | Type | Purpose |
| --- | --- | --- |
| `searchTarget` | string | Lowercase, trimmed stable location key; new building recents use the building ID. |
| `displayText` | string | Display name when the recent search was saved. |
| `createdAt` | string | Client-generated ISO 8601 time. |

Recent labels are resolved against current buildings and personal bookmarks,
so a stored `displayText` can differ from the current UI label after a rename.
The app retains the original document key for removing older records. Clear All
deletes each document in this user's `recentSearches` subcollection. Removing
a recent search does not remove its bookmark.

## Ownership and data types

Buildings, floors, and washrooms are shared reference data. Bookmarks and recent
searches belong under the authenticated user's UID. Firestore security rules
should enforce that ownership; this guide describes paths and behavior, not a
verification of deployed rules.

Keep coordinate conventions distinct: building footprint JSON uses
`[latitude, longitude]`, imported GeoJSON uses `[longitude, latitude]`, GeoPoints
have named latitude/longitude values, and bookmark coordinates are separate
numeric fields. The importer uses a Firestore Timestamp for `updatedAt`, while
client history and bookmark writes use ISO strings for `createdAt`.
