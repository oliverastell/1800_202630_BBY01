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
    const bounds = [[49.241451, -123.005848], [49.25551, -122.997222]]

    const map = L.map('map',
        {keyboard: true, 
        maxBounds: bounds, 
        fadeAnimation: false,
        zoomAnimation: false,
        markerZoomAnimation: false}).setView([49.248031, -123.000827], 18)
    
    L.maplibreGL({
        style: `https://api.maptiler.com/maps/01a15fad-137e-765e-8247-17854eac7c15/style.json?key=${mapTilerKey}`,
        attribution: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
    }).addTo(map)

    map.on("click", (e) => {
        L.marker(e.latlng).addTo(map).bindPopup("You clicked the map at " + e.latlng.toString()).openPopup()
    })
    
    map.setMinZoom(map.getBoundsZoom(map.options.maxBounds))

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

const markerLayer = L.layerGroup().addTo(map)

function showShape(shape) {
    console.log("showing", shape)
    L.circleMarker([shape.lat, shape.lng], {
    color: shape.color, fillColor: shape.color, fillOpacity: 0.8, radius: 10,
    }).addTo(markerLayer).bindPopup(shape.name)
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
}

function search() {
  const text = document.getElementById("searchField").value.trim().toLowerCase()
  searchRecent(text, false)
}

searchBarButton.addEventListener("click", clickSearch)

Object.assign(window, {searchFilter, searchRecent })

//prevent reload when button is submitted and call search()
searchForm.addEventListener("submit", function (event) {
    event.preventDefault();
    search();
});
////
//// END PLACEHOLDER
////