import { getNextMarkedLocationNumber, getCachedMarkedLocationNumber, syncLocationBookmark } from "./bookmarks.js";
import { auth } from "./firebaseConfig.js";
import { onAuthStateChanged } from "firebase/auth";
import { findBuildingAt, highlightBuilding } from "./buildings.js";
import { showBuildingFloor } from "./floorPlan.js";

export function setupLocationDetails({ map, pinLayer, clearMarkers, addMarker, closePopup }) {
  const aboutLocation = document.getElementById("aboutLocation");
  const dragHandle = document.getElementById("aboutLocationDragHandle");
  const locationTitle = document.getElementById("aboutLocationTitle");
  const locationBookmarkButton = document.getElementById("bookmarkSelectedLocation");
  const savedPins = new Map();
  const savedDetails = new Map();
  const floorDropdown = document.getElementById("floorDropdown");
  const floorPlanButton = document.getElementById("floorPlanButton");
  const floorChooser = document.getElementById("floorChooser");

  function closeFloorChooser() {
    floorChooser.classList.remove("show");
    floorPlanButton.setAttribute("aria-expanded", "false");
  }

  function setFloorBuilding(building) {
    closeFloorChooser();
    floorChooser.replaceChildren();
    const levels = building ? [...new Set(building.floorLevels ?? [1])].filter(Number.isInteger).sort((a, b) => a - b) : [];
    floorDropdown.classList.toggle("d-none", !levels.length);
    for (const level of levels) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dropdown-item";
      button.textContent = ({ 1: "1st floor", 2: "2nd floor", 3: "3rd floor", 4: "4th floor" })[level] ?? `Floor ${level}`;
      button.classList.toggle("active", level === 1);
      button.setAttribute("aria-pressed", String(level === 1));
      button.addEventListener("click", () => {
        for (const item of floorChooser.children) {
          item.classList.toggle("active", item === button);
          item.setAttribute("aria-pressed", String(item === button));
        }
        closeFloorChooser();
        showBuildingFloor(map, building, level);
      });
      floorChooser.append(button);
    }
  }

  floorPlanButton.addEventListener("click", () => {
    const open = floorChooser.classList.toggle("show");
    floorPlanButton.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", event => {
    if (!floorDropdown.contains(event.target)) closeFloorChooser();
  });
  floorDropdown.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    closeFloorChooser();
    floorPlanButton.focus();
  });
  let selectedMarker = null;
  let selectedBookmark = null;
  let selectionVersion = 0;
  let dragStart = null;
  let suppressHandleClick = false;
  let sheetSize = "half";

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
  dragHandle.addEventListener("click", () => {
    if (suppressHandleClick) {
      suppressHandleClick = false;
      return;
    }
    setSheetExpanded(!aboutLocation.classList.contains("h-100"));
  });

  function savedLocationPopup(details, marker) {
    const container = document.createElement("div");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-link rounded-pill p-0";
    button.textContent = details.name;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      showSavedLocation(details, marker);

    });
    container.append(button);
    return container;
  }

  function showSavedLocation(details, marker) {
    selectionVersion++;
    locationBookmarkButton.dataset.selectionVersion = selectionVersion;
    selectedMarker = marker;
    selectedBookmark = details;
    const building = findBuildingAt({ lat: details.latitude, lng: details.longitude });
    setFloorBuilding(building);
    if (map.isStyleLoaded()) highlightBuilding(map, building ?? null);
    aboutLocation.classList.remove("d-none");
    locationTitle.textContent = details.name;
    marker.getPopup().setDOMContent(savedLocationPopup(details, marker));
    document.getElementById("selectedLatitude").textContent = details.latitude;
    document.getElementById("selectedLongitude").textContent = details.longitude;
    locationBookmarkButton.querySelector("img").src = "/res/img/bookmark-icon-filled.svg";
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

  function close() {
    setFloorBuilding(null);
    selectionVersion++;

    aboutLocation.classList.add("d-none");
    setSheetExpanded(false);
    clearMarkers(pinLayer);
    closePopup();
    selectedMarker = null;
    selectedBookmark = null;
  }
  function retain(details, marker) {
    savedPins.set(details.searchTarget, marker);
    savedDetails.set(details.searchTarget, details);
    marker.getElement().onclick = event => {
      event.stopPropagation();
      showSavedLocation(details, marker);
      if (!marker.getPopup().isOpen()) marker.togglePopup();
    };
    showSavedLocation(details, marker);
  }
  async function selectLocation(point, label = "Selected location", building = null) {
    setFloorBuilding(building);
    setSheetExpanded(false);
    clearMarkers(pinLayer);
    closePopup();
    const version = ++selectionVersion;
    const marker = addMarker([point.lng, point.lat], label, pinLayer);
    marker.getElement().addEventListener("click", event => {
      event.stopPropagation();
      if (!marker.getPopup().isOpen()) marker.togglePopup();
    });
    marker.getPopup().on("close", () => {
      if (!pinLayer.has(marker)) return;
      pinLayer.delete(marker);
      marker.remove();
      if (selectedMarker === marker) {
        selectionVersion++;
        selectedMarker = null;
        selectedBookmark = null;
    
        aboutLocation.classList.add("d-none");
      }
    });
    selectedMarker = marker;
    selectedBookmark = null;
    if (map.isStyleLoaded()) highlightBuilding(map, building ?? null);
    marker.togglePopup();
    delete locationBookmarkButton.dataset.bookmarkKey;
    aboutLocation.classList.remove("d-none");
    if (building) locationBookmarkButton.dataset.buildingId = building.id;
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
    locationBookmarkButton.querySelector("img").src = "/res/img/bookmark-icon.svg";
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
  window.addEventListener("bookmarks-loaded", () => {
    if (selectedMarker) syncLocationBookmark(locationBookmarkButton, locationTitle.textContent);
  });
  window.addEventListener("location-bookmark-saved", ({ detail }) => {
    if (!selectedMarker || !pinLayer.has(selectedMarker)) return;
    const point = selectedMarker.getLngLat();
    if (point.lat !== detail.latitude || point.lng !== detail.longitude) return;
    if (detail.searchTarget !== locationTitle.textContent.toLowerCase().trim()) return;
    pinLayer.delete(selectedMarker);
    retain(detail, selectedMarker);
  });
  window.addEventListener("location-bookmark-removed", ({ detail }) => {
    if (locationBookmarkButton.dataset.bookmarkKey === detail.searchTarget) {
      document.getElementById("selectedBookmarkEditor").replaceChildren();
    }
    const marker = savedPins.get(detail.searchTarget);
    savedPins.delete(detail.searchTarget);
    savedDetails.delete(detail.searchTarget);
    if (marker && marker !== selectedMarker) marker.remove();
    if (selectedBookmark?.searchTarget !== detail.searchTarget) return;
    selectedBookmark = null;
    pinLayer.add(selectedMarker);
    selectedMarker.getElement().onclick = null;
    locationTitle.textContent = detail.name;
    delete locationBookmarkButton.dataset.bookmarkKey;
    locationBookmarkButton.querySelector("img").src = "/res/img/bookmark-icon.svg";
    locationBookmarkButton.setAttribute("aria-pressed", "false");
    locationBookmarkButton.setAttribute("aria-label", "Bookmark this location");
  });
  window.addEventListener("show-bookmarked-location", ({ detail }) => {
    if (!Number.isFinite(detail.latitude) || !Number.isFinite(detail.longitude)) return;
    close();
    const point = [detail.longitude, detail.latitude];
    let marker = savedPins.get(detail.searchTarget);
    if (!marker) marker = addMarker(point, detail.name, new Set());
    retain(detail, marker);
    map.jumpTo({ center: point, zoom: 18 });
    marker.togglePopup();
  });
  window.addEventListener("location-bookmark-renamed", ({ detail }) => {
    if (locationBookmarkButton.dataset.bookmarkKey === detail.searchTarget) {
      locationTitle.textContent = detail.name;
      syncLocationBookmark(locationBookmarkButton, detail.name);
    }
    const details = savedDetails.get(detail.searchTarget);
    const marker = savedPins.get(detail.searchTarget);
    if (!details || !marker) return;
    details.name = detail.name;
    marker.getPopup().setDOMContent(savedLocationPopup(details, marker));
    if (selectedBookmark === details) {
      locationTitle.textContent = detail.name;
      syncLocationBookmark(locationBookmarkButton, detail.name);
    }
  });
  document.getElementById("closeAboutLocation").addEventListener("click", close);
  onAuthStateChanged(auth, () => {
    close();
    for (const marker of savedPins.values()) marker.remove();
    savedPins.clear();
    savedDetails.clear();
  });
  return { selectLocation, close };
}
