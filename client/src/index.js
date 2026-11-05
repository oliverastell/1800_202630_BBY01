// ###############MOVED THE SEARCH PLACEHOLDERS UP HERE ###############
const searchBar = document.getElementById("searchBar");
const searchBarButton = document.getElementById("searchBarButton");
const searchMenu = document.getElementById("searchMenu");
const searchMenuResults = document.getElementById("searchMenuResults");
const searchMenuIcons = document.getElementById("searchMenuIcons");
const searchForm = document.getElementById("searchForm");

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
    
    function insideCampus([lat, lng], border) {
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
    map.on("click", (e) => {
        if (!campusBorder || !insideCampus([e.latlng.lat, e.latlng.lng], campusBorder)) return

        pinLayer.clearLayers()
        const marker = L.marker(e.latlng, { bubblingMouseEvents: false })
            .addTo(pinLayer)
            .bindPopup("You clicked the map at " + e.latlng.toString())
        marker.once("popupclose", () => pinLayer.removeLayer(marker))
        marker.openPopup()
    })

    map.setMinZoom(map.getBoundsZoom(campusBounds) + 0.5)

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
    newRow.setAttribute("class", "list-group-item p-0 position-relative border-0 rounded-pill bg-light overflow-hidden");
    let newSearch = document.createElement("button");
    newSearch.setAttribute("type", "button");
    newSearch.setAttribute("class", "btn list-group-item-action text-start text-dark text-break w-100 border-0 rounded-pill py-3 ps-3 pe-5");
    newSearch.setAttribute("onclick", "searchRecent('" + name + "')");
    newSearch.textContent = name;
    newRow.appendChild(newSearch)
    let bookmarkButton = document.createElement("button");
    bookmarkButton.setAttribute("type", "button");
    bookmarkButton.setAttribute("class", "btn border-0 rounded-circle position-absolute top-50 end-0 translate-middle-y z-1 bookmark-toggle pe-4");
    let bookmarkIcon = document.createElement("img");
    bookmarkIcon.setAttribute("src", "/res/img/bookmark-icon.svg");
    bookmarkIcon.setAttribute("alt", "Bookmark Icon");
    bookmarkIcon.setAttribute("width", "20");
    bookmarkIcon.setAttribute("height", "24");
    bookmarkIcon.addEventListener("click", function() {
        bookmarkT(bookmarkButton);
    });
    bookmarkButton.appendChild(bookmarkIcon);
    newRow.append(bookmarkButton);
    let xButton = document.createElement("button");
    xButton.setAttribute("type", "button");
    xButton.setAttribute("class", "btn border-0 rounded-circle position-absolute top-50 end-0 translate-middle-y z-1 bookmark-toggle");
    xButton.textContent = "X";
    xButton.setAttribute("onclick", "removeFromRecent(this)");
    newRow.append(xButton);
    searchMenuResults.insertBefore(newRow, searchMenuResults.firstChild);
    addtoRecentFS(name,name);
}

function checkRecentDupe(target){
    const recentSearches = searchMenuResults.querySelectorAll(".list-group-item");
    recentSearches.forEach((searches) => {
        if (searches.firstChild.textContent === target) {
            removeFromRecent(searches.firstChild);
        }
    });
}

function removeFromRecent(target){
    searchMenuResults.removeChild(target.parentElement);
    removeRecentSearchFromFirestore(target.parentElement.firstChild.textContent);
}

function clearRecent(){
    searchMenuResults.innerHTML = "";
}

function clickSearch(){
    searchMenu.classList.toggle("d-none");
    searchMenu.classList.toggle("d-flex");
}


function searchFilter(color) {
  markerLayer.clearLayers()
  shapes.filter(s => s.color === color).forEach(showShape)
  clickSearch()
}

function searchRecent(target, closeMenu = true) {
  markerLayer.clearLayers()
  shapes.filter(s => s.name === target).forEach(showShape)
  if (closeMenu) clickSearch()
    addToRecent(target)
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
