import { buildings, loadBuildings } from "./buildings.js";
// ###############MOVED THE SEARCH PLACEHOLDERS UP HERE ###############
const searchBar = document.getElementById("searchBar");
const searchBarButton = document.getElementById("searchBarButton");
const searchMenu = document.getElementById("searchMenu");
const searchMenuResults = document.getElementById("searchMenuResults");
const searchMenuIcons = document.getElementById("searchMenuIcons");
const searchForm = document.getElementById("searchForm");
const searchStatus = document.getElementById("searchStatus");
let buildingsLoadError = false;
const buildingsReady = loadBuildings().catch(error => {
  buildingsLoadError = true;
  searchStatus.textContent = "Buildings could not be loaded. Please reload to try again.";
  console.error("Error loading buildings:", error);
});

const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY;

////
//// Leaflet Map
////
    const bounds = [[49.2400, -123.0065], [49.2565, -122.9962]]
    const campusBounds = L.latLngBounds(bounds).pad(0.1)
    const map = L.map('map',
        {keyboard: true,
        maxBounds: bounds,
        fadeAnimation: false,
        zoomAnimation: false,
        markerZoomAnimation: false}).setView([49.248087, -123.001192], 18)

    L.maplibreGL({
        style: `https://api.maptiler.com/maps/01a15fad-137e-765e-8247-17854eac7c15/style.json?key=${mapTilerKey}`,
        attribution: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
    }).addTo(map)

    map.getContainer().focus()

    let campusBorder = null

    map.createPane("block")
    map.getPane("block").style.zIndex = 300

    fetch("/data/campus-block.geojson")
    .then(r => r.json())
    .then(data => {
        campusBorder = data.features[0].geometry.coordinates
        .map(([lng, lat]) => [lat, lng])

        const outside = [[-85, -180], [-85, 180], [85, 180], [85, -180]]

        L.polygon([outside, campusBorder], {
        pane: "block",
        interactive: false,
        stroke: false,
        fillColor: "#254e6c",
        fillOpacity: 0.5
        }).addTo(map)

        L.polygon(campusBorder, {
        pane: "block",
        interactive: false,
        fill: false,
        color: "#003a70",
        weight: 10,
        opacity: 0.12,
        lineJoin: "round"
        }).addTo(map)

        L.polygon(campusBorder, {
        pane: "block",
        interactive: false,
        fill: false,
        color: "#003a70",
        weight: 2,
        opacity: 0.9,
        lineJoin: "round"
        }).addTo(map)


    })

    function isInside([lat, lng], border) {
        if (!border || border.length < 3) return false

        let isInside = false
        for (let i = 0, j = border.length - 1; i < border.length; j = i++) {
            const [latI, lngI] = border[i]
            const [latJ, lngJ] = border[j]
            if ((latI > lat) !== (latJ > lat) &&
                lng < (lngJ - lngI) * (lat - latI) / (latJ - latI) + lngI) {
                isInside = !isInside
            }
        }
        return isInside
    }

    const pinLayer = L.layerGroup().addTo(map)
    map.on("click", async (e) => {
        /* Load buildings based on firestore data, if exist it will return the building, 
        if not it will check if the click is inside the campus border and add a pin.*/
        await buildingsReady;
        const b = findBuildingAt(e.latlng)
        if (b) { showBuilding(b); return }

        // if not load check if the click is inside the campus border, if not return
        if(!campusBorder || !isInside([e.latlng.lat, e.latlng.lng], campusBorder)) {
            return
        }
        // if inside the campus border and building is not found, add a pin and show the coordinates
        const { lat, lng } = e.latlng;
        const marker = L.marker(e.latlng)
          .addTo(pinLayer)
          .bindPopup("You clicked at (" + lat.toFixed(6) + ", " + lng.toFixed(6) + ")")
          .openPopup();
        marker.once("popupclose", () => {
          pinLayer.removeLayer(marker);
        });
    })
    map.setMinZoom(map.getBoundsZoom(campusBounds) + 0.5)
////
////
//// Leaflet Map
////

// Draw on leaflet map instead for now
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

//getting user's location

let locationDot = null;
let compassHeading = null;
let hasCenteredOnUser = false;

const locationIcon = L.divIcon({
  className: "",
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  html: `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="40" height="40" viewBox="0 0 40 40">
      <g data-direction visibility="hidden">
        <path d="M20 1 L14 10 L26 10 Z" fill="#1677ff" />
      </g>

      <circle cx="20" cy="20" r="8"
              fill="#1677ff" stroke="white" stroke-width="2" />
    </svg>
  `
});

function updateArrow() {
  const arrow = locationDot
    ?.getElement()
    ?.querySelector("[data-direction]");

  if (!arrow) return;

  if (!Number.isFinite(compassHeading)) {
    arrow.setAttribute("visibility", "hidden");
    return;
  }

  arrow.setAttribute("visibility", "visible");
  arrow.setAttribute(
    "transform",
    `rotate(${compassHeading} 20 20)`
  );
}

function handleOrientation(event) {
  let heading;

  if (Number.isFinite(event.webkitCompassHeading)) {
    if (event.webkitCompassAccuracy < 0) return;

    heading = event.webkitCompassHeading;
  } else if (
    event.absolute === true &&
    Number.isFinite(event.alpha)
  ) {
    heading = 360 - event.alpha;
  } else {
    return;
  }

  compassHeading = (heading + 360) % 360;
  updateArrow();
}

function setupCompass() {
  if (!window.isSecureContext || typeof DeviceOrientationEvent === "undefined") {
    console.warn("Compass needs HTTPS and a device with orientation support.");
    return;
  }
  window.addEventListener("deviceorientationabsolute", handleOrientation);
  window.addEventListener("deviceorientation", handleOrientation);

  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    map.getContainer().addEventListener("click", async () => {
      try {
        const permission = await DeviceOrientationEvent.requestPermission(true);
        if (permission !== "granted") {
          console.warn("Compass permission was denied.");
        }
      } catch (error) {
        console.error("Compass permission error:", error);
      }
    }, { once: true });
  }
}

setupCompass();

let watchId = null;

if ("geolocation" in navigator) {
  watchId = navigator.geolocation.watchPosition(
    position => {
      const { latitude, longitude, accuracy } = position.coords;
      const point = [latitude, longitude];

      console.log({
        latitude,
        longitude,
        accuracyMetres: accuracy,
        measuredAt: new Date(position.timestamp).toLocaleTimeString()
      });

      if (!locationDot) {
        locationDot = L.marker(point, {
          icon: locationIcon,
          interactive: false,
          keyboard: false
        }).addTo(map);
      } else {
        locationDot.setLatLng(point);
      }

      updateArrow();

      // Adjust the screen once, then let the user freely explore the map.
      if (!hasCenteredOnUser && campusBounds.contains(point)) {
        map.setView(point, Math.max(map.getZoom(), 18));
        hasCenteredOnUser = true;
      }
    },
    error => console.error("Location error:", error.message),
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000
    }
  );
}

const markerLayer = L.layerGroup().addTo(map)

function showShape(shape) {
    console.log("showing", shape)
    L.circleMarker([shape.lat, shape.lng], {
    color: shape.color, fillColor: shape.color, fillOpacity: 0.8, radius: 10,
    }).addTo(markerLayer).bindPopup(shape.name)
}


function addToRecent(name){
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
    let xButton = document.createElement("button");
    xButton.setAttribute("type", "button");
    xButton.setAttribute("class", "btn border-0 rounded-circle flex-shrink-0 p-0 recent-search-action");
    xButton.textContent = "X";
    xButton.setAttribute("aria-label", "Remove recent search");
    xButton.setAttribute("onclick", "removeFromRecent(this)");
    newRow.append(xButton);
    searchMenuResults.insertBefore(newRow, searchMenuResults.firstChild);
    addtoRecentFS(name,name);
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
  markerLayer.clearLayers()
  shapes.filter(s => s.color === color).forEach(showShape)
  clickSearch()
}

function findBuildingAt(latlng) {
  return buildings.find(b => isInside([latlng.lat, latlng.lng], b.border));
}

function findBuildingByText(text) {
  const t = text.toLowerCase().trim();
  if (!t) return;
  const names = b => [b.id, b.name, b.searchNames].map(n => n.toLowerCase().trim());
  return buildings.find(b => names(b).includes(t))
      || buildings.find(b => names(b).some(n => n.includes(t)));
}

function showBuilding(b) {
  markerLayer.clearLayers();
  pinLayer.clearLayers();
  const label = document.createElement("span");
  label.textContent = b.name;
  const marker = L.marker(b.center).addTo(pinLayer).bindPopup(label);
  marker.once("popupclose", () => pinLayer.removeLayer(marker));
  map.setView(b.center, 19);   // setView since zoom animation is off
  marker.openPopup();
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
  await buildingsReady;
  const b = findBuildingByText(target);
  if (b) {
    showBuilding(b);
    addToRecent(b.name);
    return;
  }
  markerLayer.clearLayers()
  const matches = shapes.filter(s => s.name.toLowerCase().trim() === target.toLowerCase().trim());
  if (!matches.length) {
    searchStatus.textContent = buildingsLoadError
      ? "Buildings could not be loaded. Please reload to try again."
      : `No building found for “${target}”.`;
    return;
  }
  pinLayer.clearLayers();
  matches.forEach(showShape);
  searchStatus.textContent = "";
  if (closeMenu && searchMenu.classList.contains("d-flex")) clickSearch();
  addToRecent(target);
}

function search() {
  const text = document.getElementById("searchField").value.trim().toLowerCase()
  searchRecent(text, false)
}

searchBarButton.addEventListener("click", clickSearch)

Object.assign(window, {searchFilter, searchRecent,removeFromRecent,clearRecent})

//prevent reload when button is submitted and call search()
searchForm.addEventListener("submit", function (event) {
    event.preventDefault();
    search();
});
////
//// END PLACEHOLDER
////
