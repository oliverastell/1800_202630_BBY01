import { highlightBuilding, findBuildingAt, findBuildingByText, isInside, toLngLat, buildings } from "./buildings.js";
import { auth, db } from "./firebaseConfig.js";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, collection, getDocs, deleteDoc } from "firebase/firestore";
import { bookmarkT, getPersonalBookmarks } from "./bookmarks.js";
import { confirmAction, showError } from "./alerts.js";
import { bookmarkForBuilding, searchLocations } from "./bookmarkNames.js";
import { setMapFilter } from "./mapFilters.js";
import { enableMapHold, trackRecentTouch } from "./mobileInteractions.js";
import { loadFloorFeatures, roomAnchor } from "./floorPlan.js";
import { setupBackButton } from "./backButton.js";

export function setupSearch({ map, mapReady, pinLayer, markerLayer, clearMarkers, getCampusBorder, closePopup, hasOpenPopup }, locationDetails, buildingLoad) {
  const searchMenu = document.getElementById("searchMenu");
  const searchField = document.getElementById("searchField");
  const closeSearchButton = document.getElementById("closeSearchMenu");
  const sheetHandle = document.getElementById("searchSheetHandle");
  const resizeHandle = document.getElementById("searchResizeHandle");
  const resizeGuide = document.getElementById("searchResizeGuide");
  const mapContainer = document.getElementById("mapCanvasDiv");
  const aboutLocation = document.getElementById("aboutLocation");
  const desktopSearch = window.matchMedia("(min-width: 768px)");
  let desktopPanelWidth;
  const minPanelWidth = 300;
  let panelDrag = null;
  let mobileSheetSize = "closed";
  let sheetDrag = null;
  let suppressSheetClick = false;
  const searchMenuResults = document.getElementById("searchMenuResults");
  const searchMenuForHide = document.getElementById("searchMenuResults11");
  const searchForm = document.getElementById("searchForm");
  const searchStatus = document.getElementById("searchStatus");
  const searchingText = document.getElementById("searchMenuSearching");
  const searchingText2 = document.getElementById("searchMenuSearching2");
  let buildingsLoadError = false;
  const buildingsReady = buildingLoad.catch(error => {
    buildingsLoadError = true;
    searchStatus.textContent = "Buildings could not be loaded. Please reload to try again.";
    console.error("Error loading buildings:", error);
  });
  buildingsReady.then(locationDetails.syncBookmarkMarkers);

  function addToRecent(name, persist = true, storedKey = null){
      const entry = searchLocations("", buildings, getPersonalBookmarks()).find(entry => entry.key === name || entry.bookmark?.searchTarget === name || entry.aliases.some(alias => alias.toLowerCase() === name.toLowerCase()));
      const target = entry?.key ?? name;
      name = entry?.name ?? name;
      checkRecentDupe(target);
      let newRow = document.createElement("div");
      newRow.setAttribute("class", "list-group-item p-0 d-flex align-items-center gap-2 border-0 rounded-pill bg-light overflow-hidden recent-search-row");
      let newSearch = document.createElement("button");
      newSearch.setAttribute("type", "button");
      newSearch.setAttribute("class", "btn list-group-item-action text-start text-dark text-break w-100 border-0 rounded-pill py-3 ps-3 pe-5");
      newRow.dataset.searchTarget = target;
      newRow.dataset.recentKey = storedKey ?? target;
      newSearch.addEventListener("click", () => searchRecent(target));
      newSearch.textContent = name;
      newRow.appendChild(newSearch)
      let bookmarkButton = document.createElement("button");
      bookmarkButton.setAttribute("type", "button");
      bookmarkButton.setAttribute("class", "btn border-0 rounded-circle flex-shrink-0 p-0 bookmark-toggle recent-search-action");
      let bookmarkIcon = document.createElement("img");
      bookmarkIcon.setAttribute("src", "/img/bookmark-icon.svg");
      bookmarkIcon.setAttribute("alt", "Bookmark Icon");
      bookmarkIcon.setAttribute("width", "20");
      bookmarkIcon.setAttribute("height", "24");
      bookmarkButton.appendChild(bookmarkIcon);
      newRow.append(bookmarkButton);
      if (entry?.bookmark) bookmarkButton.dataset.bookmarkKey = entry.bookmark.searchTarget;
      if (entry?.building) bookmarkButton.dataset.buildingId = entry.building.id;
      bookmarkT(bookmarkButton);
      let xButton = document.createElement("button");
      xButton.setAttribute("type", "button");
      xButton.setAttribute("class", "btn border-0 rounded-circle flex-shrink-0 p-0 recent-search-action recent-search-remove");
      xButton.textContent = "X";
      xButton.setAttribute("aria-label", "Remove recent search");
      xButton.setAttribute("onclick", "removeFromRecent(this)");
      newRow.append(xButton);
      searchMenuResults.insertBefore(newRow, searchMenuResults.firstChild);
      if (persist) addtoRecentFS(target,name);
  }

  function checkRecentDupe(target){
      const recentSearches = searchMenuResults.querySelectorAll(".list-group-item");
      recentSearches.forEach((searches) => {
          if ((searches.dataset.searchTarget || searches.firstElementChild.textContent).toLowerCase().trim() === target.toLowerCase().trim()) {
              // Replace the displayed row without deleting the saved recent search.
              searches.remove();
          }
      });
  }

  async function removeFromRecent(target){
      const row = target.parentElement;
      const searchTarget = row.dataset.recentKey || row.dataset.searchTarget || row.firstElementChild.textContent;
      const confirmed = await confirmAction({
          title: "Remove from recents?",
          text: `"${row.firstElementChild.textContent}" will be removed from your recent searches.`,
          confirmText: "Remove",
          danger: true
      });
      if (!confirmed) return;
      row.remove();
      removeRecentSearchFromFirestore(searchTarget);
  }

  async function clearRecent(){
      if (!searchMenuResults.children.length) return;
      const confirmed = await confirmAction({
          title: "Clear all recent searches?",
          text: "This can't be undone.",
          confirmText: "Clear all",
          danger: true
      });
      if (!confirmed) return;
      const user = auth.currentUser
      if (!user) {
          searchMenuResults.innerHTML = "";
          return
      }
      try {
          const recentRef = collection(db, "users", user.uid, "recentSearches")
          const snapshot = await getDocs(recentRef)
          for (const recentDoc of snapshot.docs) {
              await deleteDoc(recentDoc.ref)
          }
          searchMenuResults.innerHTML = "";
      } catch (error) {
          console.error("Error clearing recent searches:", error)
          showError("Could not clear your recent searches. Please try again.")
      }
  }

  function setMobileSheetSize(size) {
    if (!desktopSearch.matches && size !== "closed") {
      if (!aboutLocation.inert) locationDetails.close();
      closePopup();
    }
    if (!desktopSearch.matches && size === "half" && document.activeElement === searchField) searchField.blur();
    mobileSheetSize = size;
    sheetDrag = null;
    searchMenu.classList.remove("search-dragging");
    searchMenu.style.height = "";
    searchMenu.classList.toggle("search-open", size !== "closed");
    searchMenu.classList.toggle("search-half", size === "half");
    sheetHandle.setAttribute("aria-expanded", String(size === "full"));
    sheetHandle.setAttribute("aria-label", size === "full" ? "Shrink search menu" : "Expand search menu");
  }

  function closeMobileSearch() {
    if (desktopSearch.matches || mobileSheetSize === "closed") return;
    if (searchMenu.contains(document.activeElement)) document.activeElement.blur();
    setMobileSheetSize("closed");
  }

  function openMobileSearch() {
    if (desktopSearch.matches || mobileSheetSize !== "closed") return;
    setMobileSheetSize("full");
    searchField.focus({ preventScroll: true });
  }

  sheetHandle.addEventListener("pointerdown", event => {
    if (desktopSearch.matches || event.button !== 0 || !event.isPrimary) return;
    sheetDrag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: searchMenu.offsetHeight
    };
    suppressSheetClick = false;
    searchMenu.classList.add("search-dragging");
    searchMenu.style.height = `${sheetDrag.startHeight}px`;
    sheetHandle.setPointerCapture(event.pointerId);
  });

  sheetHandle.addEventListener("pointermove", event => {
    if (sheetDrag?.pointerId !== event.pointerId) return;
    const distance = sheetDrag.startY - event.clientY;
    if (Math.abs(distance) > 5) suppressSheetClick = true;
    if (mobileSheetSize === "closed") {
      searchMenu.classList.toggle("search-open", distance > 5);
    }
    const minHeight = searchForm.offsetHeight + sheetHandle.offsetHeight;
    const maxHeight = searchMenu.parentElement.clientHeight;
    searchMenu.style.height = `${Math.min(maxHeight, Math.max(minHeight, sheetDrag.startHeight + distance))}px`;
  });

  sheetHandle.addEventListener("pointerup", event => {
    if (sheetDrag?.pointerId !== event.pointerId) return;
    const distance = sheetDrag.startY - event.clientY;
    if (Math.abs(distance) >= 60) suppressSheetClick = true;
    if (distance >= 60 && mobileSheetSize === "closed") {
      setMobileSheetSize("half");
    } else if (distance <= -60 && mobileSheetSize === "half") {
      closeMobileSearch();
    } else if (Math.abs(distance) < 60 || mobileSheetSize === "closed") {
      setMobileSheetSize(mobileSheetSize);
    } else {
      setMobileSheetSize(distance > 0 ? "full" : "half");
    }
  });

  sheetHandle.addEventListener("lostpointercapture", () => {
    if (sheetDrag) setMobileSheetSize(mobileSheetSize);
  });

  sheetHandle.addEventListener("click", event => {
    if (suppressSheetClick && event.detail !== 0) return;
    if (mobileSheetSize === "closed") openMobileSearch();
    else setMobileSheetSize(mobileSheetSize === "full" ? "half" : "full");
  });

  function getMaxPanelWidth() {
    return Math.min(640, Math.floor(document.documentElement.clientWidth * 0.6));
  }

  function clampPanelWidth(width) {
    return Math.min(getMaxPanelWidth(), Math.max(minPanelWidth, Math.round(width)));
  }

  function setPanelWidth(width) {
    const panelWidth = clampPanelWidth(width);
    desktopPanelWidth = panelWidth;
    const widthInPixels = `${panelWidth}px`;
    searchMenu.style.width = widthInPixels;
    mapContainer.style.left = widthInPixels;
    aboutLocation.style.marginLeft = widthInPixels;
    resizeHandle.setAttribute("aria-valuemin", String(minPanelWidth));
    resizeHandle.setAttribute("aria-valuemax", String(getMaxPanelWidth()));
    resizeHandle.setAttribute("aria-valuenow", String(panelWidth));
    map.resize();
  }

  function syncSearchLayout() {
    cancelPanelDrag();
    setMobileSheetSize("closed");
    if (desktopSearch.matches) {
      setPanelWidth(desktopPanelWidth ?? searchMenu.offsetWidth);
      searchField.focus({ preventScroll: true });
    } else {
      searchMenu.style.width = "";
      mapContainer.style.left = "";
      aboutLocation.style.marginLeft = "";
      map.resize();
    }
  }

  function cancelPanelDrag() {
    if (!panelDrag) return;
    const { pointerId } = panelDrag;
    panelDrag = null;
    resizeGuide.classList.add("d-none");
    if (resizeHandle.hasPointerCapture(pointerId)) resizeHandle.releasePointerCapture(pointerId);
  }

  function getDraggedPanelWidth(event) {
    return panelDrag.startWidth + event.clientX - panelDrag.startX;
  }

  function moveResizeGuide(width) {
    resizeGuide.style.transform = `translateX(${clampPanelWidth(width)}px)`;
  }

  resizeHandle.addEventListener("pointerdown", event => {
    if (!desktopSearch.matches || !event.isPrimary || event.button !== 0 || panelDrag) return;
    panelDrag = { pointerId: event.pointerId, startX: event.clientX, startWidth: searchMenu.offsetWidth };
    resizeHandle.setPointerCapture(event.pointerId);
    moveResizeGuide(panelDrag.startWidth);
    resizeGuide.classList.remove("d-none");
  });
  resizeHandle.addEventListener("pointermove", event => {
    if (panelDrag?.pointerId === event.pointerId) moveResizeGuide(getDraggedPanelWidth(event));
  });
  resizeHandle.addEventListener("pointerup", event => {
    if (panelDrag?.pointerId !== event.pointerId) return;
    const width = getDraggedPanelWidth(event);
    cancelPanelDrag();
    setPanelWidth(width);
  });
  resizeHandle.addEventListener("lostpointercapture", event => {
    if (panelDrag?.pointerId === event.pointerId) cancelPanelDrag();
  });
  resizeHandle.addEventListener("keydown", event => {
    const width = searchMenu.offsetWidth;
    const widths = { ArrowLeft: width - 20, ArrowRight: width + 20, Home: 0, End: Infinity };
    if (!Object.hasOwn(widths, event.key)) return;
    event.preventDefault();
    cancelPanelDrag();
    setPanelWidth(widths[event.key]);
  });
  window.addEventListener("resize", () => {
    if (desktopSearch.matches) setPanelWidth(searchMenu.offsetWidth);
  });
  desktopSearch.addEventListener("change", syncSearchLayout);
  syncSearchLayout();

  function toggleMapFilter(button) {
    const enabled = button.getAttribute("aria-pressed") !== "true";
    setMapFilter(map, button.dataset.mapFilter, enabled);
    button.setAttribute("aria-pressed", String(enabled));
    button.classList.toggle("btn-primary", enabled);
    button.classList.toggle("btn-light", !enabled);
    closeMobileSearch();
  }

  function showBuilding(b) {
    clearMarkers(markerLayer);
    clearMarkers(pinLayer);
    closePopup();
    const bookmark = bookmarkForBuilding(b, getPersonalBookmarks());
    if (bookmark) {
      window.dispatchEvent(new CustomEvent("show-bookmarked-location", { detail: { ...bookmark, name: bookmark.text, latitude: bookmark.latitude ?? b.center[0], longitude: bookmark.longitude ?? b.center[1] } }));
    } else locationDetails.selectLocation({ lng: b.center[1], lat: b.center[0] }, b.name, b);
    map.jumpTo({ center: toLngLat(b.center), zoom: 18 });
    searchStatus.textContent = "";
    closeMobileSearch();
  }

  async function searchRecent(target) {
    target = target.trim();
    if (!target) {
      searchStatus.textContent = "Enter a building name, such as SW1.";
      return;
    }
    searchStatus.textContent = "Searching…";
    await Promise.all([buildingsReady, mapReady]);
    const entries = searchLocations(target, buildings, getPersonalBookmarks());
    const entry = entries.find(entry => entry.aliases.some(alias => alias.toLowerCase() === target.toLowerCase())) || entries[0];
    const b = entry?.building;
    if (!b && entry?.bookmark) {
      window.dispatchEvent(new CustomEvent("show-bookmarked-location", { detail: { ...entry.bookmark, name: entry.name } }));
      addToRecent(entry.key);
      searchForm.reset(); searchStatus.textContent = ""; return;
    }
    if (b) {
      showBuilding(b);
      addToRecent(b.id);
      document.getElementById("searchForm").reset();
      //toggleSearchingText();
      return;
    }
    clearMarkers(markerLayer)
    searchStatus.textContent = buildingsLoadError
      ? "Buildings could not be loaded. Please reload to try again."
      : `No building found for “${target}”.`;

  }

  function search() {
    const text = searchField.value.trim().toLowerCase()
    searchRecent(text)
  }

  searchField.addEventListener("focus", () => {
    if (!desktopSearch.matches && mobileSheetSize === "half") setMobileSheetSize("full");
  });
  searchField.addEventListener("click", openMobileSearch);
  searchField.addEventListener("input", openMobileSearch);
  closeSearchButton.addEventListener("click", () => {
    closeMobileSearch();
    searchField.focus({ preventScroll: true });
  });
  searchMenu.addEventListener("keydown", event => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const fromInput = event.target === searchField;
      if (!fromInput && !searchingText2.contains(event.target)) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const results = [...searchingText2.querySelectorAll("button")];
      if (!results.length || searchingText.classList.contains("d-none")) return;
      const index = results.indexOf(event.target);
      const next = event.key === "ArrowDown"
        ? results[Math.min(index + 1, results.length - 1)]
        : fromInput ? results.at(-1) : results[index - 1] ?? searchField;
      event.preventDefault();
      next.focus();
      return;
    }
    if (event.key !== "Escape") return;
    if (desktopSearch.matches && !searchingText2.contains(event.target)) return;
    if (!desktopSearch.matches && mobileSheetSize === "closed") return;
    event.preventDefault();
    closeMobileSearch();
    searchField.focus({ preventScroll: true });
  });
  for (const button of document.querySelectorAll("[data-map-filter]")) {
    button.addEventListener("click", () => toggleMapFilter(button));
  }

  // The filter chips scroll sideways; fade whichever edge has more chips past it.
  const filterBar = document.querySelector(".map-filter-bar");
  function updateFilterBarFades() {
    const maxScroll = filterBar.scrollWidth - filterBar.clientWidth;
    filterBar.classList.toggle("more-left", filterBar.scrollLeft > 1);
    filterBar.classList.toggle("more-right", filterBar.scrollLeft < maxScroll - 1);
  }
  filterBar.addEventListener("scroll", updateFilterBarFades, { passive: true });
  new ResizeObserver(updateFilterBarFades).observe(filterBar);
  // Let a mouse wheel scroll the row sideways on desktop.
  filterBar.addEventListener("wheel", event => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    if (filterBar.scrollWidth <= filterBar.clientWidth) return;
    event.preventDefault();
    filterBar.scrollLeft += event.deltaY;
  }, { passive: false });
  // Keep a chip fully in view after it is tapped.
  filterBar.addEventListener("click", event => {
    event.target.closest(".btn")?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  });
  document.getElementById("bookmarkPinFilter").addEventListener("click", closeMobileSearch);
  document.getElementById("bookmark-button").addEventListener("click", () => {
    if (desktopSearch.matches) return;
    if (!aboutLocation.inert) locationDetails.close();
    closePopup();
    closeMobileSearch();
  });
  // On mobile, get the sheets out of the way so the pin's popup is visible.
  function revealPinPopup() {
    if (desktopSearch.matches) return;
    locationDetails.collapse();
    closeMobileSearch();
  }
  map.on("pinhold", revealPinPopup);

  window.addEventListener("show-bookmarked-location", async ({ detail }) => {
    closeMobileSearch();
    clearMarkers(markerLayer);
    await Promise.all([buildingsReady, mapReady]);
    const building = findBuildingAt({ lat: detail.latitude, lng: detail.longitude });
    highlightBuilding(map, building ?? null, locationDetails.getDefaultFloor(building));
  });

  // Back (e.g. Android's back gesture) closes open sheets/popups instead of leaving the map.
  setupBackButton({
    isOpen: () => (!desktopSearch.matches && searchMenu.classList.contains("search-open"))
      || !aboutLocation.inert || hasOpenPopup(),
    closeAll: () => {
      closeMobileSearch();
      if (!aboutLocation.inert) locationDetails.close();
      closePopup();
    },
    watch: [
      [searchMenu, { attributes: true, attributeFilter: ["class"] }],
      [aboutLocation, { attributes: true, attributeFilter: ["class"] }],
      [map.getContainer(), { childList: true }],
    ],
  });

  Object.assign(window, {searchRecent,removeFromRecent,clearRecent})

  //prevent reload when button is submitted and call search()
  searchForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!desktopSearch.matches && mobileSheetSize === "closed") {
        openMobileSearch();
        return;
      }
      search();
  });

  // Touch screens: a tap on the map never drops a pin; holding the map does.
  const wasTouch = trackRecentTouch(map.getCanvasContainer());
  map.on('click', event => {
    if (event.originalEvent?.target?.closest?.(".holdable-pin")) return;
    closeMobileSearch();
    if (wasTouch()) return;
    selectMapPoint(event.lngLat);
  });
  enableMapHold(map, ({ lngLat }) => {
    closeMobileSearch();
    selectMapPoint(lngLat);
  });

  // Open spaces are too large for their centre to mean anything, so the pin stays put.
  const openSpaceKinds = new Set(["corridor", "lobby", "atrium"]);

  function ringContains(ring, { lng, lat }) {
    return isInside([lat, lng], ring.map(([x, y]) => [y, x]));
  }

  function ringArea(ring) {
    let area = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    }
    return Math.abs(area / 2);
  }

  // The named room under the point on the floor being shown, or null.
  async function findRoomAt(building, level, lngLat) {
    if (Array.isArray(building.floorLevels) && !building.floorLevels.includes(level)) return null;
    const features = await loadFloorFeatures(building.id, level).catch(() => []);
    const rooms = features.filter(feature => feature.geometry.type === "Polygon"
      && String(feature.properties.name ?? "").trim()
      && !openSpaceKinds.has(feature.properties.kind)
      && ringContains(feature.geometry.coordinates[0], lngLat));
    // Pick the smallest match in case shapes overlap.
    return rooms.sort((a, b) => ringArea(a.geometry.coordinates[0]) - ringArea(b.geometry.coordinates[0]))[0] ?? null;
  }

  let mapPointRequest = 0;
  async function selectMapPoint(lngLat) {
    const request = ++mapPointRequest;
    await Promise.all([buildingsReady, mapReady]);
    const { lat, lng } = lngLat;
    const building = findBuildingAt(lngLat);
    if (building) {
      // Drop the pin where the user pointed (snapped to the room there, if any),
      // while still highlighting the building and its floor plan.
      const level = locationDetails.getDefaultFloor(building);
      const room = await findRoomAt(building, level, lngLat);
      if (request !== mapPointRequest) return;
      clearMarkers(markerLayer);
      if (room) {
        const [roomLng, roomLat] = roomAnchor(room);
        locationDetails.selectLocation({ lng: roomLng, lat: roomLat },
          building.name + " " + String(room.properties.name).trim(), building, level);
      } else {
        locationDetails.selectLocation({ lng, lat }, building.name, building);
      }
      return;
    }
    highlightBuilding(map, null, locationDetails.getDefaultFloor());
    if (!getCampusBorder() || !isInside([lat, lng], getCampusBorder())) {
      locationDetails.close();
      return;
    }
    locationDetails.selectLocation(lngLat);
  }


  async function addtoRecentFS(searchTarget, displayText) {
      searchTarget = searchTarget.toLowerCase().trim()
      const user = auth.currentUser
      if (!user) return
      try {
          const recentRef = doc(db, "users", user.uid, "recentSearches", searchTarget)
          await setDoc(recentRef, {
          searchTarget: searchTarget,
          displayText: displayText,
          createdAt: new Date().toISOString()
      })
    } catch (error) {
          console.error("Error saving recent search:", error)
    }
  }

  async function removeRecentSearchFromFirestore(searchTarget) {
    searchTarget = searchTarget.toLowerCase().trim()
    const user = auth.currentUser
    if (!user) return

    try {
      const recentRef = doc(db, "users", user.uid, "recentSearches", searchTarget)
      await deleteDoc(recentRef)
      //console.log(`Removed recent search '${searchTarget}' from Firestore`)
    } catch (error) {
      console.error("Error removing recent search:", error)
    }
  }


function toggleSearchingText(isSearching) {
  searchingText.classList.toggle("d-none", !isSearching);
  searchingText.classList.toggle("d-flex", isSearching);
  searchMenuForHide.classList.toggle("d-none", isSearching);
}


function renderSuggestions() {
  const query = searchField.value.trim();
  toggleSearchingText(Boolean(query));
  const hadResultFocus = searchingText2.contains(document.activeElement);
  searchingText2.replaceChildren();
  if (hadResultFocus) searchField.focus({ preventScroll: true });
  if (!query) return;

  const matches = searchLocations(query, buildings, getPersonalBookmarks()).slice(0, 10);
  if (!matches.length) {
    const message = document.createElement("p");
    message.className = "small text-body-secondary mb-0";
    message.setAttribute("role", "status");
    message.textContent = buildingsLoading ? "Loading locations…" : "No matching locations.";
    searchingText2.append(message);
    return;
  }

  for (const { key, name, building } of matches) {
    const row = document.createElement("div");
    row.className = "list-group-item p-0 d-flex align-items-center gap-2 border-0 rounded-pill bg-light overflow-hidden recent-search-row";
    const result = document.createElement("button");
    result.type = "button";
    result.className = "btn list-group-item-action text-start text-dark text-break w-100 border-0 rounded-pill py-3 ps-3 pe-5";
    result.textContent = building && name !== building.name ? `${name} · ${building.name}` : name;
    result.addEventListener("click", () => searchRecent(key));
    row.append(result);
    searchingText2.append(row);
  }
}

searchField.addEventListener("input", () => {
  if (!buildingsLoadError) searchStatus.textContent = "";
  renderSuggestions();
});
searchForm.addEventListener("reset", () => {
  searchField.value = "";
  renderSuggestions();
});
let buildingsLoading = true;
buildingsReady.then(() => {
  buildingsLoading = false;
  renderSuggestions();
});
function refreshPersonalNames() {
  renderSuggestions();
  const targets = [...searchMenuResults.children].map(row => ({ target: row.dataset.searchTarget, storedKey: row.dataset.recentKey })).filter(row => row.target);
  searchMenuResults.replaceChildren();
  targets.reverse().forEach(row => addToRecent(row.target, false, row.storedKey));
}
["bookmarks-loaded", "location-bookmark-saved", "location-bookmark-renamed", "location-bookmark-removed"].forEach(event => window.addEventListener(event, refreshPersonalNames));

toggleSearchingText(false);
  

  onAuthStateChanged(auth, async user => {
    searchMenuResults.replaceChildren();
    if (!user) return;
    try {
      const snapshot = await getDocs(collection(db, "users", user.uid, "recentSearches"));
      await buildingsReady;
      if (auth.currentUser?.uid !== user.uid) return;
      snapshot.forEach(doc => {
        const recent = doc.data();
        const building = findBuildingByText(recent.searchTarget);
        addToRecent(building?.id ?? recent.searchTarget, false, doc.id);
      });
    } catch (error) {
      console.error("Error loading recent searches:", error);
    }
  });

}
