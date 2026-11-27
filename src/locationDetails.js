import { getNextMarkedLocationNumber, getCachedMarkedLocationNumber, getPersonalBookmarks, syncLocationBookmark } from "./bookmarks.js";
import { auth } from "./firebaseConfig.js";
import { onAuthStateChanged } from "firebase/auth";
import { LngLatBounds } from "maplibre-gl";
import { buildings, findBuildingAt, highlightBuilding } from "./buildings.js";
import { bookmarkForBuilding } from "./bookmarkNames.js";
import { loadFloorFeatures, roomAnchor, showBuildingFloor } from "./floorPlan.js";
import { setDefaultFilterFloor } from "./mapFilters.js";
import { findWalkingRoute } from "./walkingRoute.js";

function locationTypeLabel(building) {
  const type = typeof building?.type === "string" ? building.type.trim() : "";
  return type.toLowerCase() === "parking" ? "Parking lot" : type;
}

function locationDetailItems(building) {
  if (!Array.isArray(building?.details)) return [];
  return building.details.filter(value => typeof value === "string").map(value => value.trim()).filter(Boolean);
}

function detailListItems(details) {
  return details.map(detail => {
    const item = document.createElement("li");
    item.textContent = detail;
    return item;
  });
}

function floorLevels(building) {
  return [...new Set(building.floorLevels ?? [1])].filter(Number.isInteger).sort((a, b) => a - b);
}

function floorLabel(level) {
  return ({ 1: "1st floor", 2: "2nd floor", 3: "3rd floor", 4: "4th floor" })[level] ?? `Floor ${level}`;
}

export function setupLocationDetails({ map, mapReady, pinLayer, clearMarkers, addMarker, closePopup, getCurrentLocation }) {
  const aboutLocation = document.getElementById("aboutLocation");
  const dragHandle = document.getElementById("aboutLocationDragHandle");
  const locationTitle = document.getElementById("aboutLocationTitle");
  const locationTypeRow = document.getElementById("selectedLocationTypeRow");
  const locationType = document.getElementById("selectedLocationType");
  const locationDetailsRow = document.getElementById("selectedLocationDetailsRow");
  const locationDetails = document.getElementById("selectedLocationDetails");
  const locationBookmarkButton = document.getElementById("bookmarkSelectedLocation");
  const savedPins = new Map();
  const bookmarkLayer = new Set();
  const floorDropdown = document.getElementById("floorDropdown");
  const floorPlanButton = document.getElementById("floorPlanButton");
  const floorChooser = document.getElementById("floorChooser");
  const directionsButton = document.getElementById("directionsToBuilding");
  const routeStatus = document.getElementById("routeStatus");
  let directionsBuilding = null;
  let routeRequest = null;
  let routeVisible = false;
  const emptyRoute = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } };

  function clearRoute() {
    routeRequest?.abort();
    routeRequest = null;
    routeVisible = false;
    directionsButton.disabled = false;
    directionsButton.textContent = "Show walking route";
    routeStatus.textContent = "";
    routeStatus.classList.add("d-none");
    map.getSource("walking-route")?.setData(emptyRoute);
  }

  function setDirectionsBuilding(building) {
    clearRoute();
    directionsBuilding = building;
    directionsButton.classList.toggle("d-none", !building);
  }

  directionsButton.addEventListener("click", async () => {
    if (!directionsBuilding) return;
    if (routeVisible) { clearRoute(); return; }
    const current = getCurrentLocation?.();
    if (!current || Date.now() - current.timestamp > 120000) {
      routeStatus.textContent = "Waiting for your location. Allow location access, then try again.";
      routeStatus.classList.remove("d-none");
      return;
    }
    const building = directionsBuilding;
    const request = new AbortController();
    routeRequest = request;
    directionsButton.disabled = true;
    routeStatus.textContent = "Finding walking route…";
    routeStatus.classList.remove("d-none");
    try {
      const route = await findWalkingRoute({
        current,
        originBuilding: findBuildingAt({ lat: current.latitude, lng: current.longitude }),
        destinationBuilding: building,
        signal: request.signal
      });
      if (request.signal.aborted || directionsBuilding !== building) return;
      await mapReady;
      if (request.signal.aborted || directionsBuilding !== building) return;
      if (!map.getSource("walking-route")) {
        map.addSource("walking-route", { type: "geojson", data: emptyRoute });
        map.addLayer({ id: "walking-route-casing", type: "line", source: "walking-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffffff", "line-width": 9 } });
        map.addLayer({ id: "walking-route-line", type: "line", source: "walking-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#1677ff", "line-width": 6 } });
      }
      map.getSource("walking-route").setData({ type: "Feature", properties: {}, geometry: route.geometry });
      map.moveLayer("walking-route-casing");
      map.moveLayer("walking-route-line");
      const coordinates = route.geometry.coordinates;
      const bounds = coordinates.reduce((bounds, point) => bounds.extend(point), new LngLatBounds(coordinates[0], coordinates[0]));
      map.fitBounds(bounds, { padding: { top: 80, right: 40, bottom: Math.min(map.getContainer().clientHeight / 2 + 30, 350), left: 40 }, maxZoom: 18 });
      routeStatus.textContent = `${Math.round(route.distance)} m · about ${Math.max(1, Math.round(route.duration / 60))} min walk`;
      directionsButton.textContent = "Clear walking route";
      routeVisible = true;
    } catch (error) {
      if (!request.signal.aborted) {
        console.error("Walking route error:", error);
        routeStatus.textContent = "Walking route unavailable. Please try again.";
      }
    } finally {
      if (routeRequest === request) {
        routeRequest = null;
        directionsButton.disabled = false;
      }
    }
  });

  const roomsearchForm = document.getElementById("roomsearchForm");
  const roomsearchField = document.getElementById("roomsearchField");
  const roomSearch = document.getElementById("roomSearch");
  const roomSearchStatus = document.getElementById("roomSearchStatus");
  const mapFloorControl = document.getElementById("map-floor-control");
  const mapFloorButton = document.getElementById("map-floor-button");
  const mapFloorPopup = document.getElementById("map-floor-popup");
  const mapFloorSelect = document.getElementById("map-floor-select");
  let defaultFloor = 1;
  let roomSearchBuilding = null;
  let roomSearchRequest = 0;

  function getDefaultFloor(building) {
    if (!building) return defaultFloor;
    const levels = floorLevels(building);
    return levels.includes(defaultFloor) ? defaultFloor : levels.includes(1) ? 1 : levels[0] ?? 1;
  }

  function setMapFloorPickerOpen(open) {
    mapFloorPopup.hidden = !open;
    mapFloorButton.setAttribute("aria-expanded", String(open));
    if (open) mapFloorSelect.focus({ preventScroll: true });
  }

  mapFloorButton.addEventListener("click", () => {
    if (mapFloorPopup.hidden) {
      const levels = [...new Set([1, ...buildings.flatMap(floorLevels)])].sort((a, b) => a - b);
      mapFloorSelect.replaceChildren(...levels.map(level => new Option(floorLabel(level), level)));
      mapFloorSelect.value = String(defaultFloor);
    }
    setMapFloorPickerOpen(mapFloorPopup.hidden);
  });
  mapFloorPopup.addEventListener("submit", event => {
    event.preventDefault();
    defaultFloor = Number(mapFloorSelect.value);
    setDefaultFilterFloor(map, defaultFloor);
    if (roomSearchBuilding) {
      const building = roomSearchBuilding;
      const level = getDefaultFloor(building);
      setFloorBuilding(building, level);
      showBuildingFloor(map, building, level);
    } else {
      showBuildingFloor(map, null, defaultFloor);
    }
    setMapFloorPickerOpen(false);
    mapFloorButton.focus({ preventScroll: true });
  });
  document.addEventListener("click", event => {
    if (!mapFloorPopup.hidden && !mapFloorControl.contains(event.target)) setMapFloorPickerOpen(false);
  });
  mapFloorControl.addEventListener("keydown", event => {
    if (event.key !== "Escape" || mapFloorPopup.hidden) return;
    event.stopPropagation();
    setMapFloorPickerOpen(false);
    mapFloorButton.focus({ preventScroll: true });
  });

  function closeFloorChooser() {
    floorChooser.classList.remove("show");
    floorPlanButton.setAttribute("aria-expanded", "false");
  }

  function setFloorBuilding(building, activeLevel = 1) {
    closeFloorChooser();
    floorChooser.replaceChildren();
    const levels = building ? floorLevels(building) : [];
    roomSearchBuilding = levels.length ? building : null;
    roomSearchRequest++;
    roomSearch.hidden = !roomSearchBuilding;
    roomsearchForm.reset();
    roomSearchStatus.textContent = "";
    floorDropdown.classList.toggle("d-none", !levels.length);
    floorPlanButton.classList.toggle("d-none", !levels.length);
    for (const level of levels) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dropdown-item";
      button.textContent = floorLabel(level);
      button.classList.toggle("active", level === activeLevel);
      button.setAttribute("aria-pressed", String(level === activeLevel));
      button.addEventListener("click", () => {
        for (const item of floorChooser.children) {
          item.classList.toggle("active", item === button);
          item.setAttribute("aria-pressed", String(item === button));
        }
        closeFloorChooser();
        floorPlanButton.focus({ preventScroll: true });
        showBuildingFloor(map, building, level);
      });
      floorChooser.append(button);
    }
  }

  floorPlanButton.addEventListener("click", () => {
    const open = floorChooser.classList.toggle("show");
    floorPlanButton.setAttribute("aria-expanded", String(open));
    if (open) floorChooser.querySelector(".active")?.focus({ preventScroll: true });
  });
  document.addEventListener("click", event => {
    if (floorPlanButton.contains(event.target) || floorChooser.contains(event.target)) {
      return
    }
    if (!floorDropdown.contains(event.target)) closeFloorChooser();
  });
  floorDropdown.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeFloorChooser();
      floorPlanButton.focus({ preventScroll: true });
    }
  });
  // isStyleLoaded() turns false while a map source is updating (e.g. right after the
  // previous highlight is cleared), which would skip the next highlight. Only the
  // initial map load matters here.
  let mapLoaded = false;
  mapReady.then(() => { mapLoaded = true; });
  let selectedMarker = null;
  let selectedBookmark = null;
  let selectionVersion = 0;
  let dragStart = null;
  let suppressHandleClick = false;
  let sheetSize = "half";

  function setLocationPopupOpen(open) {
    aboutLocation.classList.toggle("popup-hidden", !open);
    aboutLocation.inert = !open;
  }

  function setSheetExpanded(expanded) {
    setSheetSize(expanded ? "full" : "half");
  }

  function setSheetSize(size) {
    sheetSize = size;
    aboutLocation.classList.remove("location-dragging");
    aboutLocation.style.height = "";
    aboutLocation.classList.toggle("h-100", size === "full");
    aboutLocation.classList.toggle("h-50", size === "half");
    aboutLocation.classList.toggle("location-collapsed", size === "collapsed");
    if (size === "collapsed") {
      aboutLocation.style.height = "32px";
      aboutLocation.scrollTop = 0;
    }
    const expanded = size === "full";
    dragHandle.setAttribute("aria-expanded", String(expanded));
    dragHandle.setAttribute("aria-label", expanded ? "Collapse location details" : "Expand location details");
  }

  dragHandle.addEventListener("pointerdown", event => {
    if (event.button !== 0 || !event.isPrimary) return;
    dragStart = { pointerId: event.pointerId, y: event.clientY, height: aboutLocation.getBoundingClientRect().height,
      size: sheetSize };
    suppressHandleClick = false;
    aboutLocation.classList.add("location-dragging");
    aboutLocation.style.setProperty("height", `${dragStart.height}px`, "important");
    dragHandle.setPointerCapture(event.pointerId);
  });

  dragHandle.addEventListener("pointermove", event => {
    if (!dragStart || event.pointerId !== dragStart.pointerId) return;
    const distance = dragStart.y - event.clientY;
    if (Math.abs(distance) > 5) suppressHandleClick = true;
    const fullHeight = aboutLocation.parentElement.getBoundingClientRect().height;
    aboutLocation.style.setProperty("height", `${Math.min(fullHeight, Math.max(Math.min(32, fullHeight / 2), dragStart.height + distance))}px`, "important");
  });

  function finishDrag(event, cancelled = false) {
    if (!dragStart || event.pointerId !== dragStart.pointerId) return;
    const distance = dragStart.y - event.clientY;
    const sizes = ["collapsed", "half", "full"];
    const size = cancelled || Math.abs(distance) < 60
      ? dragStart.size
      : sizes[Math.max(0, Math.min(2, sizes.indexOf(dragStart.size) + (distance > 0 ? 1 : -1)))];
    dragStart = null;
    setSheetSize(size);
  }

  dragHandle.addEventListener("pointerup", event => finishDrag(event));
  dragHandle.addEventListener("pointercancel", event => finishDrag(event, true));
  dragHandle.addEventListener("lostpointercapture", event => finishDrag(event, true));
  dragHandle.addEventListener("click", () => {
    if (suppressHandleClick) {
      suppressHandleClick = false;
      return;
    }
    setSheetExpanded(!aboutLocation.classList.contains("h-100"));
  });

  function setLocationMetadata(building) {
    const type = locationTypeLabel(building);
    const details = locationDetailItems(building);
    locationType.textContent = type;
    locationTypeRow.hidden = !type;
    locationDetails.replaceChildren(...detailListItems(details));
    locationDetailsRow.hidden = !details.length;
  }

  function popupContent(title, building) {
    const type = locationTypeLabel(building);
    const container = document.createElement("div");
    container.append(title);
    if (!type) return container;
    const metadata = document.createElement("div");
    metadata.className = "small text-body-secondary text-break";
    metadata.textContent = `Type: ${type}`;
    container.append(metadata);
    return container;
  }

  function buildingForBookmark(details) {
    return buildings.find(building => building.id === details.buildingId)
      ?? findBuildingAt({ lat: details.latitude, lng: details.longitude });
  }

  function savedLocationPopup(details, marker) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-link rounded-pill p-0";
    button.textContent = details.name;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      showSavedLocation(details, marker);

    });
    return popupContent(button, buildingForBookmark(details));
  }

  function showSavedLocation(details, marker) {
    selectionVersion++;
    locationBookmarkButton.dataset.selectionVersion = selectionVersion;
    selectedMarker = marker;
    selectedBookmark = details;
    if (sheetSize === "collapsed") setSheetSize("half");
    const building = buildingForBookmark(details);
    const level = getDefaultFloor(building);
    setFloorBuilding(building, level);
    setDirectionsBuilding(building);
    if (mapLoaded) highlightBuilding(map, building ?? null, level);
    setLocationPopupOpen(true);
    locationTitle.textContent = details.name;
    setLocationMetadata(building);
    marker.getPopup().setDOMContent(savedLocationPopup(details, marker));
    document.getElementById("selectedLatitude").textContent = details.latitude;
    document.getElementById("selectedLongitude").textContent = details.longitude;
    locationBookmarkButton.querySelector("img").src = "/img/bookmark-icon-filled.svg";
    locationBookmarkButton.setAttribute("aria-pressed", "true");
    locationBookmarkButton.setAttribute("aria-label", "Location bookmarked");
    locationBookmarkButton.disabled = false;
    locationBookmarkButton.dataset.bookmarkKey = details.searchTarget;
    if (details.buildingId) locationBookmarkButton.dataset.buildingId = details.buildingId;
    else delete locationBookmarkButton.dataset.buildingId;
    locationBookmarkButton.dataset.latitude = details.latitude;
    locationBookmarkButton.dataset.longitude = details.longitude;
    locationBookmarkButton.setAttribute("aria-label", "Remove bookmark");
    syncLocationBookmark(locationBookmarkButton, details.name);
  }

  // Remove the building highlight and floor plan drawn for the current selection.
  function clearMapSelection() {
    if (mapLoaded) highlightBuilding(map, null, getDefaultFloor());
  }

  function close() {
    // Clear the selection first so the popup close handlers below do not re-enter close().
    selectedMarker = null;
    selectedBookmark = null;
    setFloorBuilding(null);
    clearMapSelection();
    setDirectionsBuilding(null);
    selectionVersion++;

    setLocationPopupOpen(false);
    setSheetExpanded(false);
    clearMarkers(pinLayer);
    closePopup();
  }
  const bookmarkPinFilter = document.getElementById("bookmarkPinFilter");
  let bookmarkPinsVisible = true;
  bookmarkPinFilter.addEventListener("click", () => {
    bookmarkPinsVisible = !bookmarkPinsVisible;
    bookmarkPinFilter.setAttribute("aria-pressed", String(bookmarkPinsVisible));
    bookmarkPinFilter.classList.toggle("btn-primary", bookmarkPinsVisible);
    bookmarkPinFilter.classList.toggle("btn-light", !bookmarkPinsVisible);
    for (const { marker } of savedPins.values()) {
      marker.getElement().hidden = !bookmarkPinsVisible;
      if (!bookmarkPinsVisible) marker.getPopup().remove();
    }
  });

  function syncBookmarkMarkers() {
    const visible = new Set();
    for (const bookmark of getPersonalBookmarks()) {
      let { latitude, longitude } = bookmark;
      let buildingId = bookmark.buildingId;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
          || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        const building = buildings.find(building => building.id === buildingId)
          ?? buildings.find(building => bookmarkForBuilding(building, [bookmark]));
        if (!building) continue;
        [latitude, longitude] = building.center;
        buildingId = building.id;
      }

      const { searchTarget, text: name } = bookmark;
      visible.add(searchTarget);
      const existing = savedPins.get(searchTarget);
      if (existing) {
        const { details, marker } = existing;
        if (details.latitude !== latitude || details.longitude !== longitude) {
          marker.setLngLat([longitude, latitude]);
        }
        const nameChanged = details.name !== name;
        Object.assign(details, { name, buildingId, latitude, longitude });
        if (nameChanged) {
          marker.getElement().title = name;
          marker.getElement().setAttribute("aria-label", `Open bookmark: ${name}`);
          marker.getPopup().setDOMContent(savedLocationPopup(details, marker));
          if (selectedBookmark === details) locationTitle.textContent = name;
        }
        continue;
      }

      const details = { searchTarget, name, buildingId, latitude, longitude };
      const element = document.createElement("button");
      element.type = "button";
      element.className = "bookmark-marker";
      element.hidden = !bookmarkPinsVisible;
      element.title = name;
      element.setAttribute("aria-label", `Open bookmark: ${name}`);
      const icon = document.createElement("img");
      icon.src = "/img/bookmark-icon-filled.svg";
      icon.alt = "";
      element.append(icon);
      const marker = addMarker([longitude, latitude], name, bookmarkLayer, { element, anchor: "center" });
      marker.getPopup().setDOMContent(savedLocationPopup(details, marker));
      // Closing the selected bookmark's popup ends the selection, like a dropped pin.
      marker.getPopup().on("close", () => {
        if (selectedMarker === marker) close();
      });
      // Let the native button's click handle keyboard activation as well.
      element.addEventListener("keypress", event => event.stopImmediatePropagation(), true);
      element.addEventListener("click", event => {
        event.stopPropagation();
        clearMarkers(pinLayer);
        closePopup();
        showSavedLocation(details, marker);
        marker.togglePopup();
      });
      savedPins.set(searchTarget, { details, marker });
    }

    for (const [key, { marker }] of savedPins) {
      if (visible.has(key)) continue;
      if (selectedMarker === marker) close();
      marker.remove();
      bookmarkLayer.delete(marker);
      savedPins.delete(key);
    }
  }
  function endSelection(marker) {
    if (selectedMarker !== marker) return;
    selectionVersion++;
    selectedMarker = null;
    selectedBookmark = null;
    setFloorBuilding(null);
    clearMapSelection();
    setLocationPopupOpen(false);
  }

  // Filter pins (washrooms, dining, parking) already exist on the map, so the
  // selection reuses them instead of dropping a new pin; closing their popup ends it.
  const placeMarkers = new WeakSet();
  function usePlaceMarker(marker) {
    if (placeMarkers.has(marker)) return;
    placeMarkers.add(marker);
    marker.getPopup().on("close", () => endSelection(marker));
  }

  // `place` (optional): { marker, type, details } for a filter pin.
  async function selectLocation(point, label = "Selected location", building = null, roomLevel = null, place = null) {
    setDirectionsBuilding(building);
    setSheetExpanded(false);
    clearMarkers(pinLayer);
    closePopup();
    const level = roomLevel ?? getDefaultFloor(building);
    setFloorBuilding(building, level);
    setLocationMetadata(building);
    if (place) {
      locationType.textContent = place.type ?? "";
      locationTypeRow.hidden = !place.type;
      locationDetails.replaceChildren(...detailListItems(place.details ?? []));
      locationDetailsRow.hidden = !place.details?.length;
    }
    const version = ++selectionVersion;
    let marker;
    if (place) {
      marker = place.marker;
      usePlaceMarker(marker);
    } else {
      const content = building ? popupContent(label, building) : label;
      marker = addMarker([point.lng, point.lat], content, pinLayer);
      marker.getElement().addEventListener("click", event => {
        event.stopPropagation();
        if (!marker.getPopup().isOpen()) marker.togglePopup();
      });
      marker.getPopup().on("close", () => {
        if (!pinLayer.has(marker)) return;
        pinLayer.delete(marker);
        marker.remove();
        endSelection(marker);
      });
    }
    selectedMarker = marker;
    selectedBookmark = null;
    if (mapLoaded) highlightBuilding(map, building, level);
    if (!marker.getPopup().isOpen()) marker.togglePopup();
    delete locationBookmarkButton.dataset.bookmarkKey;
    setLocationPopupOpen(true);
    // A filter pin bookmarks its own spot, unless the place is the building itself (parking).
    if (building && roomLevel === null && (!place || place.isBuilding)) locationBookmarkButton.dataset.buildingId = building.id;
    else delete locationBookmarkButton.dataset.buildingId;
    locationTitle.textContent = label === "Selected location" ? "Marked location " + getCachedMarkedLocationNumber() : label;
    document.getElementById("selectedLatitude").textContent = point.lat;
    document.getElementById("selectedLongitude").textContent = point.lng;
    locationBookmarkButton.dataset.selectionVersion = version;
    locationBookmarkButton.dataset.latitude = point.lat;
    locationBookmarkButton.dataset.longitude = point.lng;
    locationBookmarkButton.disabled = false;
    locationBookmarkButton.setAttribute("aria-pressed", "false");
    locationBookmarkButton.setAttribute("aria-label", "Bookmark this location");
    locationBookmarkButton.querySelector("img").src = "/img/bookmark-icon.svg";
    syncLocationBookmark(locationBookmarkButton, locationTitle.textContent);
    try {
      const number = label === "Selected location" ? await getNextMarkedLocationNumber() : null;
      if (version !== selectionVersion) return;
      if (locationBookmarkButton.disabled) return;
      locationTitle.textContent = number === null ? label : 'Marked location ' + number;
      syncLocationBookmark(locationBookmarkButton, locationTitle.textContent);
      locationBookmarkButton.disabled = false;
    } catch (error) {
      if (version !== selectionVersion) return;
      locationBookmarkButton.disabled = false;
      console.error("Could not get location number:", error);
    }
  }
  roomsearchForm.addEventListener("submit", async event => {
    event.preventDefault();
    const building = roomSearchBuilding;
    if (!building) return;
    const request = ++roomSearchRequest;
    const query = roomsearchField.value.trim().toLowerCase();
    const floor = query.match(/^[a-z]*([0-9])/);
    const level = floor ? Number(floor[1]) : NaN;
    if (!(building.floorLevels ?? [1]).includes(level)) {
      roomSearchStatus.textContent = "Enter a room number on an available floor.";
      return;
    }

    roomSearchStatus.textContent = "Searching for room...";
    try {
      const features = await loadFloorFeatures(building.id, level);
      if (request !== roomSearchRequest) return;
      const room = features.find(feature => String(feature.properties.name).trim().toLowerCase() === query);
      if (!room) {
        roomSearchStatus.textContent = "Room not found.";
        return;
      }
      const [lng, lat] = roomAnchor(room);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new Error("Invalid room coordinates");
      await selectLocation({ lng, lat }, building.name + " " + room.properties.name, building, level);
    } catch (error) {
      if (request !== roomSearchRequest) return;
      roomSearchStatus.textContent = "Room search is unavailable for this floor.";
      console.error("Could not search floor rooms:", error);
    }
  });
  window.addEventListener("bookmarks-loaded", () => {
    syncBookmarkMarkers();
    if (selectedMarker) syncLocationBookmark(locationBookmarkButton, locationTitle.textContent);
  });
  window.addEventListener("location-bookmark-saved", ({ detail }) => {
    syncBookmarkMarkers();
    if (!selectedMarker || !pinLayer.has(selectedMarker)) return;
    const point = selectedMarker.getLngLat();
    if (point.lat !== detail.latitude || point.lng !== detail.longitude) return;
    if (detail.searchTarget !== locationTitle.textContent.toLowerCase().trim()) return;
    const saved = savedPins.get(detail.searchTarget);
    if (!saved) return;
    clearMarkers(pinLayer);
    showSavedLocation(saved.details, saved.marker);
    if (bookmarkPinsVisible) saved.marker.togglePopup();
  });
  window.addEventListener("location-bookmark-removed", ({ detail }) => {
    const point = selectedBookmark?.searchTarget === detail.searchTarget ? selectedMarker.getLngLat() : null;
    syncBookmarkMarkers();
    if (point) selectLocation(point, detail.name, findBuildingAt(point));
    else if (selectedMarker) syncLocationBookmark(locationBookmarkButton, locationTitle.textContent);
  });
  window.addEventListener("show-bookmarked-location", ({ detail }) => {
    const saved = savedPins.get(detail.searchTarget);
    if (!saved) return;
    close();
    showSavedLocation(saved.details, saved.marker);
    map.jumpTo({ center: saved.marker.getLngLat(), zoom: 18 });
    if (bookmarkPinsVisible) saved.marker.togglePopup();
  });
  window.addEventListener("show-map-place", ({ detail }) => {
    const building = buildings.find(building => building.id === detail.buildingId) ?? null;
    const floor = Number(String(detail.floorId ?? "").replace(/^f/, ""));
    const level = Number.isInteger(floor) && floor > 0 ? floor : null;
    const { lng, lat } = detail.marker.getLngLat();
    selectLocation({ lng, lat }, detail.name, building, level,
      { marker: detail.marker, type: detail.type, details: detail.details, isBuilding: detail.isBuilding });
  });
  window.addEventListener("location-bookmark-renamed", ({ detail }) => {
    if (locationBookmarkButton.dataset.bookmarkKey === detail.searchTarget) {
      locationTitle.textContent = detail.name;
      syncLocationBookmark(locationBookmarkButton, detail.name);
    }
  });
  function dismissDetails() {
    const bookmarkMarker = selectedBookmark && selectedMarker?.getElement();
    close();
    (bookmarkPinsVisible && bookmarkMarker ? bookmarkMarker : map.getCanvas()).focus({ preventScroll: true });
  }
  document.getElementById("closeAboutLocation").addEventListener("click", dismissDetails);
  aboutLocation.addEventListener("keydown", event => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.stopPropagation();
    dismissDetails();
  });
  // Shrink the open sheet to its handle so a map popup is not covered.
  function collapse() {
    if (!aboutLocation.inert) setSheetSize("collapsed");
  }
  onAuthStateChanged(auth, close);
  syncBookmarkMarkers();
  return { selectLocation, close, collapse, syncBookmarkMarkers, getDefaultFloor };
}
