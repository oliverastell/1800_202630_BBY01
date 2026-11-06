import { buildings, loadBuildings, highlightBuilding } from "./buildings.js";
import {Map, Marker, Popup, LngLat, LngLatBounds, NavigationControl, setWorkerUrl} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// Let Vite bundle and serve MapLibre's worker before creating the map.
setWorkerUrl(workerUrl);
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

// MapLibre coordinates are [longitude, latitude].
const toLngLat = ([lat, lng]) => [lng, lat];
const bounds = [[-123.0065, 49.2400], [-122.9962, 49.2565]];
// Two extra zoom-out levels need four times the visible area in each direction.
const boundsCenter = bounds[0].map((value, axis) => (value + bounds[1][axis]) / 2);
const zoomOutBounds = bounds.map(point => point.map(
  (value, axis) => boundsCenter[axis] + (value - boundsCenter[axis]) * 4
));
const campusBounds = new LngLatBounds([-123.00753, 49.23835], [-122.99517, 49.25815]);
const map = new Map({
  container: 'map',
  style: `https://api.maptiler.com/maps/01a15fad-137e-765e-8247-17854eac7c15/style.json?key=${mapTilerKey}`,
  center: [-123.001192, 49.248087],
  zoom: 17, maxBounds: zoomOutBounds, renderWorldCopies: false,
  transformCameraUpdate: ({ center }) => ({
    center: new LngLat(center.lng, Math.max(bounds[0][1], Math.min(bounds[1][1], center.lat)))
  }),
  dragRotate: true, pitchWithRotate: true, touchPitch: true
});

map.addControl(new NavigationControl({ showCompass: true}), 'top-left');
map.getCanvas().focus();

// Custom SW1 footprint traced from the supplied coordinates.
let campusBorder = null;
const mapReady = new Promise(resolve => map.once('load', resolve));
mapReady.then(() => {
  
  map.addSource('sw1', { type: 'geojson', data: '/data/sw1Fill.geojson' });
  map.addLayer({
    id: 'sw1-fill', type: 'fill', source: 'sw1',
    paint: { 'fill-color': '#e6e9e6', 'fill-opacity': 1 }
  });
  
}).catch(error => console.error('Error adding SW1 overlay:', error));
Promise.all([mapReady, fetch('/data/campus-block.geojson').then(r => {
  if (!r.ok) throw new Error('Campus border could not be loaded');
  return r.json();
})]).then(([, data]) => {
  const ring = data.features[0].geometry.coordinates.map(p => [...p]);
  if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) ring.push([...ring[0]]);
  campusBorder = ring.map(([lng, lat]) => [lat, lng]);
  map.addSource('campus-mask', { type: 'geojson', data: {
    type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [
      [[-180,-85],[180,-85],[180,85],[-180,85],[-180,-85]], ring
    ]}
  }});
  map.addSource('campus-border', { type: 'geojson', data: {
    type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring }
  }});
  map.addLayer({ id: 'campus-mask', type: 'fill', source: 'campus-mask',
    paint: { 'fill-color': '#254e6c', 'fill-opacity': 0.5, 'fill-antialias': false } });
  for (const [id, width, opacity] of [['glow',10,0.12], ['line',2,0.9]]) {
    map.addLayer({ id: 'campus-border-' + id, type: 'line', source: 'campus-border',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#003a70', 'line-width': width, 'line-opacity': opacity } });
  }
}).catch(error => console.error('Error loading campus border:', error));
const pinLayer = new Set();
const markerLayer = new Set();
let activePopup = null;
function clearMarkers(markers) {
  for (const marker of [...markers]) marker.remove();
  markers.clear();
}
function addMarker(point, content, markers, options = {}, removeOnClose = false) {
  const popup = new Popup({ offset: 25, closeOnClick: true, maxWidth: '300px' });
  if (typeof content === 'string') popup.setText(content);
  else popup.setDOMContent(content);
  const marker = new Marker(options).setLngLat(point).setPopup(popup).addTo(map);
  markers.add(marker);
  popup.on('open', () => {
    if (activePopup && activePopup !== popup) activePopup.remove();
    activePopup = popup;
  });
  popup.on('close', () => {
    if (activePopup === popup) activePopup = null;
    if (removeOnClose) { markers.delete(marker); marker.remove(); }
  });
  return marker;
}

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

map.on('click', async event => {
  await Promise.all([buildingsReady, mapReady]);
  const { lat, lng } = event.lngLat;
  const building = findBuildingAt(event.lngLat);
  if (building) { showBuilding(building); return; }
  clearMarkers(pinLayer);
  if (activePopup) activePopup.remove();
  highlightBuilding(map, null);
  if (!campusBorder || !isInside([lat, lng], campusBorder)) return;
  addMarker([lng, lat], 'You clicked at (' + lat.toFixed(6) + ', ' + lng.toFixed(6) + ')',
    pinLayer, {}, true).togglePopup();
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

//getting user's location

let locationDot = null;
let compassHeading = null;
let hasCenteredOnUser = false;

const locationIcon = document.createElement('div');
locationIcon.className = 'user-location-marker';
locationIcon.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="40" height="40" viewBox="0 0 40 40">
      <g data-direction visibility="hidden">
        <path d="M20 1 L14 10 L26 10 Z" fill="#1677ff" />
      </g>

      <circle cx="20" cy="20" r="8"
              fill="#1677ff" stroke="white" stroke-width="2" />
    </svg>
`;

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
      const point = [longitude, latitude];

      console.log({
        latitude,
        longitude,
        accuracyMetres: accuracy,
        measuredAt: new Date(position.timestamp).toLocaleTimeString()
      });

      if (!locationDot) {
        locationDot = new Marker({ element: locationIcon }).setLngLat(point).addTo(map);
      } else {
        locationDot.setLngLat(point);
      }

      updateArrow();

      // Adjust the screen once, then let the user freely explore the map.
      if (!hasCenteredOnUser && campusBounds.contains(point)) {
        map.jumpTo({ center: point, zoom: Math.max(map.getZoom(), 17) });
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

function showShape(shape) {
  const element = document.createElement('div');
  element.className = 'shape-marker';
  element.style.backgroundColor = shape.color;
  element.style.borderColor = shape.color;
  addMarker([shape.lng, shape.lat], shape.name, markerLayer, { element });
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
  if (map.isStyleLoaded()) highlightBuilding(map, null);
  clearMarkers(markerLayer)
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
  highlightBuilding(map, b);
  clearMarkers(markerLayer);
  clearMarkers(pinLayer);
  if (activePopup) activePopup.remove();
  const marker = new Marker().setLngLat(toLngLat(b.center)).addTo(map);
  pinLayer.add(marker)
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
  clearMarkers(pinLayer);
  highlightBuilding(map, null);
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
