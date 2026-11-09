import {Map, Marker, Popup, LngLat, NavigationControl, setWorkerUrl} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';


setWorkerUrl(workerUrl);

export function createCampusMap() {
  const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY;

  // MapLibre coordinates are [longitude, latitude].

  const bounds = [[-123.0065, 49.2400], [-122.9962, 49.2565]];
  // Two extra zoom-out levels need four times the visible area in each direction.
  const boundsCenter = bounds[0].map((value, axis) => (value + bounds[1][axis]) / 2);
  const zoomOutBounds = bounds.map(point => point.map(
    (value, axis) => boundsCenter[axis] + (value - boundsCenter[axis]) * 4
  ));
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


  return {
    map, mapReady, pinLayer, markerLayer, clearMarkers, addMarker,
    getCampusBorder: () => campusBorder,
    closePopup: () => { if (activePopup) activePopup.remove(); }
  };
}
