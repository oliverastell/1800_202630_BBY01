import { loadBuildings, highlightBuilding, findBuildingAt, findBuildingByText, isInside, toLngLat, buildings } from "./buildings.js";
import { auth, db } from "./firebaseConfig.js";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, collection, getDocs, deleteDoc } from "firebase/firestore";
import { bookmarkT } from "./bookmarks.js";

export function setupSearch({ map, mapReady, pinLayer, markerLayer, clearMarkers, addMarker, getCampusBorder, closePopup }, locationDetails) {
  const searchBar = document.getElementById("searchBar");
  const searchBarButton = document.getElementById("searchBarButton");
  const searchMenu = document.getElementById("searchMenu");
  const searchMenuResults = document.getElementById("searchMenuResults");
  const searchMenuForHide = document.getElementById("searchMenuResults11");
  const searchForm = document.getElementById("searchForm");
  const searchStatus = document.getElementById("searchStatus");
  const searchingText = document.getElementById("searchMenuSearching");
  const searchingText2 = document.getElementById("searchMenuSearching2");
  let buildingsLoadError = false;
  const buildingsReady = loadBuildings().catch(error => {
    buildingsLoadError = true;
    searchStatus.textContent = "Buildings could not be loaded. Please reload to try again.";
    console.error("Error loading buildings:", error);
  });

  const shapes = [
    { name: "red square 1",       color: "red",    lat: 49.2490, lng: -123.0020 },
    { name: "green circle 1",     color: "green",  lat: 49.2485, lng: -123.0010 },
    { name: "blue triangle 3",    color: "blue",   lat: 49.2480, lng: -123.0000 },
    { name: "yellow rectangle 2", color: "yellow", lat: 49.2475, lng: -122.9995 },
    { name: "red circle 1",       color: "red",    lat: 49.2488, lng: -123.0005 },
    { name: "green square 1",     color: "green",  lat: 49.2492, lng: -123.0012 },
    { name: "blue square 3",      color: "blue",   lat: 49.2478, lng: -123.0015 },
    { name: "yellow circle 1",    color: "yellow", lat: 49.2483, lng: -122.9990 },
  ]

  function showShape(shape) {
    const element = document.createElement('div');
    element.className = 'shape-marker';
    element.style.backgroundColor = shape.color;
    element.style.borderColor = shape.color;
    addMarker([shape.lng, shape.lat], shape.name, markerLayer, { element });
  }

  function addToRecent(name, persist = true){
      checkRecentDupe(name);
      let newRow = document.createElement("div");
      newRow.setAttribute("class", "list-group-item p-0 d-flex align-items-center gap-2 border-0 rounded-pill bg-light overflow-hidden recent-search-row");
      let newSearch = document.createElement("button");
      newSearch.setAttribute("type", "button");
      newSearch.setAttribute("class", "btn list-group-item-action text-start text-dark text-break w-100 border-0 rounded-pill py-3 ps-3 pe-5");
      newSearch.addEventListener("click", () => searchRecent(name));
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
      bookmarkT(bookmarkButton);
      let xButton = document.createElement("button");
      xButton.setAttribute("type", "button");
      xButton.setAttribute("class", "btn border-0 rounded-circle flex-shrink-0 p-0 recent-search-action");
      xButton.textContent = "X";
      xButton.setAttribute("aria-label", "Remove recent search");
      xButton.setAttribute("onclick", "removeFromRecent(this)");
      newRow.append(xButton);
      searchMenuResults.insertBefore(newRow, searchMenuResults.firstChild);
      if (persist) addtoRecentFS(name,name);
  }

  function checkRecentDupe(target){
      const recentSearches = searchMenuResults.querySelectorAll(".list-group-item");
      recentSearches.forEach((searches) => {
          if (searches.firstElementChild.textContent.toLowerCase().trim() === target.toLowerCase().trim()) {
              // Replace the displayed row without deleting the saved recent search.
              searches.remove();
          }
      });
  }

  function removeFromRecent(target){
      const row = target.parentElement;
      const searchTarget = row.firstElementChild.textContent;
      row.remove();
      removeRecentSearchFromFirestore(searchTarget);
  }

  function clearRecent(){
      searchMenuResults.innerHTML = "";
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


  function searchFilter(color) {
    locationDetails.close();
    if (map.isStyleLoaded()) highlightBuilding(map, null);
    clearMarkers(markerLayer)
    shapes.filter(s => s.color === color).forEach(showShape)
    clickSearch()
  }

  function showBuilding(b) {
    highlightBuilding(map, b);
    clearMarkers(markerLayer);
    clearMarkers(pinLayer);
    closePopup();
    locationDetails.selectLocation({ lng: b.center[1], lat: b.center[0] }, b.name, b);
    map.jumpTo({ center: toLngLat(b.center), zoom: 18 });
    searchStatus.textContent = "";
    if (searchMenu.classList.contains("d-flex")) clickSearch();
  }

  async function searchRecent(target, closeMenu = true) {
    target = target.trim();
    if (!target) {
      searchStatus.textContent = "Enter a building name, such as SW1.";
      return;
    }
    searchStatus.textContent = "Searching…";
    await Promise.all([buildingsReady, mapReady]);
    const b = findBuildingByText(target);
    if (b) {
      showBuilding(b);
      addToRecent(b.name);
      document.getElementById("searchForm").reset();
      //toggleSearchingText();
      return;
    }
    clearMarkers(markerLayer)
    const matches = shapes.filter(s => s.name.toLowerCase().trim() === target.toLowerCase().trim());
    if (!matches.length) {
      searchStatus.textContent = buildingsLoadError
        ? "Buildings could not be loaded. Please reload to try again."
        : `No building found for “${target}”.`;
      return;
    }
    locationDetails.close();
    clearMarkers(pinLayer);
    highlightBuilding(map, null);
    matches.forEach(showShape);
    searchStatus.textContent = "";
    if (closeMenu && searchMenu.classList.contains("d-flex")) clickSearch();
    addToRecent(target);
    document.getElementById("searchForm").reset();
  }



  function search() {
    const text = document.getElementById("searchField").value.trim().toLowerCase()
    searchRecent(text, false)
  }

  searchBarButton.addEventListener("click", clickSearch)

  window.addEventListener("show-bookmarked-location", () => {
    if (searchMenu.classList.contains("d-flex")) clickSearch();
    clearMarkers(markerLayer);
    if (map.isStyleLoaded()) highlightBuilding(map, null);
  });

  Object.assign(window, {searchFilter, searchRecent,removeFromRecent,clearRecent})

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


function toggleSearchingText() {
  searchingText.classList.toggle("d-none");
  searchingText.classList.toggle("d-flex");
  searchMenuForHide.classList.toggle("d-none");
  searchMenuForHide.classList.toggle("d-flex");
}


function searchKeyboard(event) {
    if(event instanceof KeyboardEvent) {
      searchingText2.innerHTML = "";
      const searchtext = document.getElementById("searchField").value.trim().toLowerCase();
      console.log(searchtext);
      if (searchtext.length >= 1 && searchingText.classList.contains("d-none")){
        toggleSearchingText();
      }
      if (event.key == "Backspace" && searchtext.length == 0 && searchingText.classList.contains("d-flex")){
        toggleSearchingText();
      }
      if (searchtext.length > 0){
        //ERASE THIS ONCE WE ADD MORE BUILDINGS I GUESS
        shapes.filter(s => s.name.includes(searchtext)).forEach(showtext => {
          if (showtext.name.startsWith(searchtext)){
            console.log(showtext.name);
            let newRow = document.createElement("div");
            newRow.setAttribute("class", "list-group-item p-0 d-flex align-items-center gap-2 border-0 rounded-pill bg-light overflow-hidden recent-search-row");
            let newSearch = document.createElement("button");
            newSearch.setAttribute("type", "button");
            newSearch.setAttribute("class", "btn list-group-item-action text-start text-dark text-break w-100 border-0 rounded-pill py-3 ps-3 pe-5");
            newSearch.addEventListener("click", () => searchRecent(showtext.name));
            newSearch.addEventListener("click", () => toggleSearchingText());
            newSearch.textContent = showtext.name;
            newRow.appendChild(newSearch)
            searchingText2.insertBefore(newRow, searchingText2.firstChild);
          }
          });
          buildings.filter(s => s.searchNames.includes(searchtext)).forEach(showtext => {
          if (showtext.searchNames.startsWith(searchtext)){
            console.log(showtext.searchNames);
            let newRow = document.createElement("div");
            newRow.setAttribute("class", "list-group-item p-0 d-flex align-items-center gap-2 border-0 rounded-pill bg-light overflow-hidden recent-search-row");
            let newSearch = document.createElement("button");
            newSearch.setAttribute("type", "button");
            newSearch.setAttribute("class", "btn list-group-item-action text-start text-dark text-break w-100 border-0 rounded-pill py-3 ps-3 pe-5");
            newSearch.addEventListener("click", () => searchRecent(showtext.searchNames));
            newSearch.addEventListener("click", () => toggleSearchingText());
            newSearch.textContent = showtext.searchNames;
            newRow.appendChild(newSearch)
            searchingText2.insertBefore(newRow, searchingText2.firstChild);
          }
        });
      }
          }
      }
document.getElementById("searchField").addEventListener("keyup", searchKeyboard, false);

searchingText.classList.toggle("d-none");
  

  onAuthStateChanged(auth, async user => {
    if (!user) return;
    try {
      const snapshot = await getDocs(collection(db, "users", user.uid, "recentSearches"));
      snapshot.forEach(doc => addToRecent(doc.data().searchTarget, false));
    } catch (error) {
      console.error("Error loading recent searches:", error);
    }
  });

}
