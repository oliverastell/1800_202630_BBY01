import { getNextMarkedLocationNumber, getCachedMarkedLocationNumber, renameLocationBookmark, syncLocationBookmark } from "./bookmarks.js";
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
      button.textContent = level === 1 ? "1st floor" : `Floor ${level}`;
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

  function setSheetExpanded(expanded) {
    aboutLocation.classList.remove("location-dragging");
    aboutLocation.style.height = "";
    aboutLocation.classList.toggle("h-100", expanded);
    aboutLocation.classList.toggle("h-50", !expanded);
    dragHandle.setAttribute("aria-expanded", String(expanded));
    dragHandle.setAttribute("aria-label", expanded ? "Collapse location details" : "Expand location details");
  }

  dragHandle.addEventListener("pointerdown", event => {
    if (event.button !== 0 || !event.isPrimary) return;
    dragStart = { pointerId: event.pointerId, y: event.clientY, height: aboutLocation.getBoundingClientRect().height,
      expanded: aboutLocation.classList.contains("h-100") };
    suppressHandleClick = false;
    aboutLocation.classList.add("location-dragging");
    dragHandle.setPointerCapture(event.pointerId);
  });

  dragHandle.addEventListener("pointermove", event => {
    if (!dragStart || event.pointerId !== dragStart.pointerId) return;
    const distance = dragStart.y - event.clientY;
    if (Math.abs(distance) > 5) suppressHandleClick = true;
    const fullHeight = aboutLocation.parentElement.getBoundingClientRect().height;
    aboutLocation.style.setProperty("height", `${Math.min(fullHeight, Math.max(fullHeight / 2, dragStart.height + distance))}px`, "important");
  });

  function finishDrag(event, cancelled = false) {
    if (!dragStart || event.pointerId !== dragStart.pointerId) return;
    const distance = dragStart.y - event.clientY;
    const expanded = cancelled || Math.abs(distance) < 60
      ? dragStart.expanded
      : distance > 0;
    dragStart = null;
    setSheetExpanded(expanded);
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
      editLocationName(details, marker);
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
    locationTitle.replaceChildren();
    const nameButton = document.createElement("button");
    nameButton.type = "button";
    nameButton.className = "btn btn-link text-dark fw-semibold rounded-pill";
    nameButton.textContent = details.name;
    nameButton.title = "Click to rename this location";
    nameButton.addEventListener("click", () => editLocationName(details, marker));
    locationTitle.appendChild(nameButton);
    marker.getPopup().setDOMContent(savedLocationPopup(details, marker));
    document.getElementById("selectedLatitude").textContent = details.latitude;
    document.getElementById("selectedLongitude").textContent = details.longitude;
    locationBookmarkButton.querySelector("img").src = "/res/img/bookmark-icon-filled.svg";
    locationBookmarkButton.setAttribute("aria-pressed", "true");
    locationBookmarkButton.setAttribute("aria-label", "Location bookmarked");
    locationBookmarkButton.disabled = false;
    locationBookmarkButton.dataset.bookmarkKey = details.searchTarget;
    locationBookmarkButton.dataset.latitude = details.latitude;
    locationBookmarkButton.dataset.longitude = details.longitude;
    locationBookmarkButton.setAttribute("aria-label", "Remove bookmark");
  }

  function editLocationName(details, marker) {
    const form = document.createElement("form");
    form.className = "d-flex flex-wrap justify-content-center gap-2";
    const input = document.createElement("input");
    input.className = "form-control rounded-pill";
    input.value = details.name;
    input.required = true;
    input.setAttribute("aria-label", "Location name");
    const save = document.createElement("button");
    save.type = "submit";
    save.className = "btn btn-primary rounded-pill";
    save.textContent = "Save";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn btn-outline-secondary rounded-pill";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => showSavedLocation(details, marker));
    const status = document.createElement("span");
    status.className = "small text-danger w-100";
    status.setAttribute("role", "status");
    form.append(input, save, cancel, status);
    locationTitle.replaceChildren(form);
    input.focus();
    input.select();
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!input.value.trim()) {
        status.textContent = "Enter a name for this location.";
        return;
      }
      save.disabled = true;
      input.disabled = true;
      cancel.disabled = true;
      try {
        details.name = await renameLocationBookmark(details.searchTarget, input.value);
        marker.getPopup().setDOMContent(savedLocationPopup(details, marker));
        if (selectedBookmark === details) showSavedLocation(details, marker);
      } catch (error) {
        status.textContent = "Could not save the name. Please try again.";
        console.error("Could not rename bookmark:", error);
        save.disabled = false;
        input.disabled = false;
        cancel.disabled = false;
      }
    });
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
    const marker = savedPins.get(detail.searchTarget);
    savedPins.delete(detail.searchTarget);
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
  document.getElementById("closeAboutLocation").addEventListener("click", close);
  onAuthStateChanged(auth, () => {
    close();
    for (const marker of savedPins.values()) marker.remove();
    savedPins.clear();
  });
  return { selectLocation, close };
}
