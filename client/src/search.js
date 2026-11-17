import { loadBuildings, highlightBuilding, findBuildingAt, findBuildingByText, isInside, toLngLat, buildings } from "./buildings.js";
import { auth, db } from "./firebaseConfig.js";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, collection, getDocs, deleteDoc } from "firebase/firestore";
import { bookmarkT, getPersonalBookmarks } from "./bookmarks.js";
import { bookmarkForBuilding, searchLocations } from "./personalNames.js";
import { setWashroomFilter } from "./washrooms.js";

export function setupSearch({ map, mapReady, pinLayer, markerLayer, clearMarkers, getCampusBorder, closePopup }, locationDetails) {
  const searchBar = document.getElementById("searchBar");
  const searchBarButton = document.getElementById("searchBarButton");
  const searchMenu = document.getElementById("searchMenu");
  const searchMenuResults = document.getElementById("searchMenuResults");
  const searchMenuForHide = document.getElementById("searchMenuResults11");
  const searchForm = document.getElementById("searchForm");
  const searchStatus = document.getElementById("searchStatus");
  const searchingText = document.getElementById("searchMenuSearching");
  const searchingText2 = document.getElementById("searchMenuSearching2");
  const washroomFilter = document.getElementById("washroomFilter");
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

  //Clicksearch hide the search bar and show the search bar again when close the menu, the menu can be close by clicking the map.
  function clickSearch() {
    searchMenu.classList.toggle("d-none");
    searchMenu.classList.toggle("d-flex");

    const isMenuOpen = searchMenu.classList.contains("d-flex")

    if (isMenuOpen) {
      searchBar.classList.add("d-none")
      map.once("click", clickSearch)
    }
    else {
      searchBar.classList.remove("d-none")
      map.off("click", clickSearch)
    }
  }


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
    clickSearch();
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
    if (searchMenu.classList.contains("d-flex")) clickSearch();
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
    const text = document.getElementById("searchField").value.trim().toLowerCase()
    searchRecent(text)
  }

  searchBarButton.addEventListener("click", clickSearch)
  washroomFilter.addEventListener("click", showWashrooms);

  window.addEventListener("show-bookmarked-location", async ({ detail }) => {
    if (searchMenu.classList.contains("d-flex")) clickSearch();
    clearMarkers(markerLayer);
    await Promise.all([buildingsReady, mapReady]);
    const building = findBuildingAt({ lat: detail.latitude, lng: detail.longitude });
    highlightBuilding(map, building ?? null);
  });

  Object.assign(window, {searchRecent,removeFromRecent,clearRecent})

  //prevent reload when button is submitted and call search()
  searchForm.addEventListener("submit", function (event) {
      event.preventDefault();
      search();
  });

  map.on('click', async event => {
    await Promise.all([buildingsReady, mapReady]);
    const { lat, lng } = event.lngLat;
    const building = findBuildingAt(event.lngLat);
    if (building) { showBuilding(building); return; }
    highlightBuilding(map, null);
    if (!getCampusBorder() || !isInside([lat, lng], getCampusBorder())) {
      locationDetails.close();
      return;
    }
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
