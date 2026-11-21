import { loadBuildings, highlightBuilding, findBuildingAt, findBuildingByText, isInside, toLngLat, buildings } from "./buildings.js";
import { auth, db } from "./firebaseConfig.js";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, collection, getDocs, deleteDoc, getDoc } from "firebase/firestore";
import { bookmarkT, getPersonalBookmarks } from "./bookmarks.js";
import { bookmarkForBuilding, searchLocations } from "./personalNames.js";
import { setWashroomFilter } from "./washrooms.js";
import { showBuildingFloor } from "./floorPlan.js";

export function setupSearch({ map, mapReady, pinLayer, markerLayer, clearMarkers, getCampusBorder, closePopup }, locationDetails) {
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
  const washroomFilter = document.getElementById("washroomFilter");
  const roomsearchForm = document.getElementById("roomsearchForm");
  const roomsearchField = document.getElementById("roomsearchField");
  const submitRoomSearch = document.getElementById("submitRoomSearch");
  const aboutLocationTitle = document.getElementById("aboutLocationTitle");
  let washroomsVisible = false;
  let buildingsLoadError = false;
  const buildingsReady = loadBuildings().catch(error => {
    buildingsLoadError = true;
    searchStatus.textContent = "Buildings could not be loaded. Please reload to try again.";
    console.error("Error loading buildings:", error);
  });

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
      bookmarkIcon.setAttribute("src", "/res/img/bookmark-icon.svg");
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
      xButton.setAttribute("class", "btn border-0 rounded-circle flex-shrink-0 p-0 recent-search-action");
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

  function removeFromRecent(target){
      const row = target.parentElement;
      const searchTarget = row.dataset.recentKey || row.dataset.searchTarget || row.firstElementChild.textContent;
      row.remove();
      removeRecentSearchFromFirestore(searchTarget);
  }

  async function clearRecent(){
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
      }
  }

  function setMobileSheetSize(size) {
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
      searchField.focus({ preventScroll: true });
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

  function showWashrooms() {
    washroomsVisible = !washroomsVisible;
    setWashroomFilter(map, washroomsVisible);
    washroomFilter.setAttribute("aria-pressed", String(washroomsVisible));
    washroomFilter.setAttribute("aria-label", washroomsVisible ? "Hide washrooms" : "Show washrooms");
    washroomFilter.classList.toggle("btn-primary", washroomsVisible);
    washroomFilter.classList.toggle("btn-light", !washroomsVisible);
    locationDetails.close();
    if (map.isStyleLoaded()) highlightBuilding(map, null);
    clearMarkers(markerLayer);
    clearMarkers(pinLayer);
    closePopup();
    closeMobileSearch();
  }

  function showBuilding(b) {
    highlightBuilding(map, b);
    clearMarkers(markerLayer);
    clearMarkers(pinLayer);
    closePopup();
    const bookmark = bookmarkForBuilding(b, getPersonalBookmarks());
    if (bookmark) {
      window.dispatchEvent(new CustomEvent("show-bookmarked-location", { detail: { ...bookmark, name: bookmark.text, latitude: bookmark.latitude ?? b.center[0], longitude: bookmark.longitude ?? b.center[1] } }));
    } else locationDetails.selectLocation({ lng: b.center[1], lat: b.center[0] }, b.name, b);
    map.jumpTo({ center: toLngLat(b.center), zoom: 18 });
    searchStatus.textContent = "";
    roomsearchField.classList.toggle('d-flex');
    submitRoomSearch.classList.toggle('d-flex');
    //roomsearch.classList.toggle('d-flex');
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

  async function searchRoom(){
    console.log(aboutLocationTitle.textContent);
    const currentbuilding = aboutLocationTitle.textContent;
    console.log(roomsearchField.value[0]);
    if (typeof roomsearchField.value[0] == "string"){
      showBuildingFloor(map,findBuildingByText(aboutLocationTitle.textContent),Number(roomsearchField.value[1]));
    }
    else{
      showBuildingFloor(map,findBuildingByText(aboutLocationTitle.textContent),Number(roomsearchField.value[0]));
    }
    //showBuildingFloor(map,findBuildingByText(aboutLocationTitle.textContent),Number(roomsearchField.value[0]));
    const floorDocRef = doc(db, "buildings", `${aboutLocationTitle.textContent}`.toLowerCase(), "floors", `f${roomsearchField.value[0]}`);
    const floorDoc = await getDoc(floorDocRef);
      if (floorDoc.exists()) {
        console.log("Floor document exists:", floorDoc.data());
        let roomexist = false; 
        const rooms = floorDoc.data().features
        for (let i = 0; i < rooms.length; i++){
          //console.log(rooms[i].properties.name)
          if (rooms[i].properties.name == roomsearchField.value){
            roomexist = true;
            console.log(rooms[i].properties.label_anchor[0]);
             console.log(rooms[i].properties.label_anchor[1]);
            const roomCoords3 = {"lng":rooms[i].properties.label_anchor[0],"lat":rooms[i].properties.label_anchor[1]}
            //searchRecent(currentbuilding);
            locationDetails.selectLocation(roomCoords3,currentbuilding.concat(" ",roomsearchField.value));
            //showBuildingFloor(map,findBuildingByText(aboutLocationTitle.textContent),Number(roomsearchField.value[0]));
            roomsearchField.value = "";
          } 
        }
        if (roomexist == false){
          console.log("invalid room");
        }
        //console.log(floorDoc.data().features[0].properties.name);
      }
      else{
        console.log("Floor document does not exist.");
      }
  }

  function search() {
    const text = searchField.value.trim().toLowerCase()
    searchRecent(text)
  }

  searchField.addEventListener("click", openMobileSearch);
  searchField.addEventListener("input", openMobileSearch);
  closeSearchButton.addEventListener("click", closeMobileSearch);
  searchMenu.addEventListener("keydown", event => {
    if (event.key !== "Escape" || desktopSearch.matches || mobileSheetSize === "closed") return;
    event.preventDefault();
    setMobileSheetSize("closed");
    searchField.focus({ preventScroll: true });
  });
  washroomFilter.addEventListener("click", showWashrooms);

  window.addEventListener("show-bookmarked-location", async ({ detail }) => {
    closeMobileSearch();
    clearMarkers(markerLayer);
    await Promise.all([buildingsReady, mapReady]);
    const building = findBuildingAt({ lat: detail.latitude, lng: detail.longitude });
    highlightBuilding(map, building ?? null);
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

    roomsearchForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!desktopSearch.matches && mobileSheetSize === "closed") {
        openMobileSearch();
        return;
      }
      searchRoom();
  });

  map.on('click', async event => {
    closeMobileSearch();
    await Promise.all([buildingsReady, mapReady]);
    const { lat, lng } = event.lngLat;
    const building = findBuildingAt(event.lngLat);
    if (building) { showBuilding(building); return; }
    highlightBuilding(map, null);
    if (!getCampusBorder() || !isInside([lat, lng], getCampusBorder())) {
      locationDetails.close();
      return;
    }
    console.log(event.lngLat);
    locationDetails.selectLocation(event.lngLat);
  });


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


let previousSuggestionQuery = "";
function searchKeyboard(event) {
    {
      const searchtext = document.getElementById("searchField").value.trim().toLowerCase();
      toggleSearchingText(searchtext.length > 0);
      const matches = searchtext ? searchLocations(searchtext, buildings, getPersonalBookmarks()).slice(0, 10) : [];
      const keepPreviousMatches = searchtext.length > 0 && previousSuggestionQuery.length > 0 && searchtext.startsWith(previousSuggestionQuery) && matches.length === 0;
      previousSuggestionQuery = searchtext;
      if (keepPreviousMatches) return;
      searchingText2.innerHTML = "";
      if (searchtext.length > 0){
          matches.forEach(showtext => {
          {
            let newRow = document.createElement("div");
            newRow.setAttribute("class", "list-group-item p-0 d-flex align-items-center gap-2 border-0 rounded-pill bg-light overflow-hidden recent-search-row");
            let newSearch = document.createElement("button");
            newSearch.setAttribute("type", "button");
            newSearch.setAttribute("class", "btn list-group-item-action text-start text-dark text-break w-100 border-0 rounded-pill py-3 ps-3 pe-5");
            newSearch.addEventListener("click", () => searchRecent(showtext.key));
            newSearch.textContent = showtext.building && showtext.name !== showtext.building.name ? `${showtext.name} · ${showtext.building.name}` : showtext.name;
            newRow.appendChild(newSearch)
            searchingText2.insertBefore(newRow, searchingText2.firstChild);
          }
        });
      }
          }
      }
document.getElementById("searchField").addEventListener("input", searchKeyboard, false);
searchForm.addEventListener("reset", () => {
  document.getElementById("searchField").value = "";
  searchKeyboard();
});
buildingsReady.then(searchKeyboard);
function refreshPersonalNames() {
  previousSuggestionQuery = "";
  searchKeyboard();
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
