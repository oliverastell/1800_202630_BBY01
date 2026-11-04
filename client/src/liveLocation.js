export function startLiveLocation(map, L, button, status) {
  const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 };
  let watchId = null;
  let generation = 0;
  let pendingRequest = null;
  let disposed = false;
  let blocked = false;
  let following = true;
  let dot = null;
  let accuracyCircle = null;
  let latest = null;
  let lastError = "";

  function setFollowing(value) {
    following = value;
    button.setAttribute("aria-pressed", String(value));
  }

  function showStatus() {
    if (document.hidden) {
      status.textContent = "Location paused while this page is hidden.";
    } else if (lastError) {
      status.textContent = lastError;
    } else if (latest) {
      const age = Math.max(0, Math.floor((Date.now() - latest.timestamp) / 1000));
      status.textContent = `${age >= 15 ? "Waiting for GPS" : "Live location"} · ±${Math.round(latest.coords.accuracy)} m · ${age}s ago`;
    } else {
      status.textContent = "Finding your location…";
    }
    if (dot && latest) {
      const stale = blocked || !!lastError || Date.now() - latest.timestamp >= 15000;
      dot.setStyle({ fillColor: stale ? "#6c757d" : "#1677ff" });
    }
  }

  function centerOnUser(firstFix = false) {
    if (!latest) return;
    const position = [latest.coords.latitude, latest.coords.longitude];
    // Allow the map to follow a real position beyond the initial campus bounds.
    map.setMaxBounds(null);
    if (firstFix) map.setView(position, 18);
    else map.panTo(position, { animate: false });
  }

  function onPosition(position) {
    if (latest && position.timestamp <= latest.timestamp) return;
    latest = position;
    lastError = "";
    const point = [position.coords.latitude, position.coords.longitude];
    const firstFix = !dot;
    if (firstFix) {
      accuracyCircle = L.circle(point, {
        radius: position.coords.accuracy, color: "#1677ff", weight: 1,
        fillColor: "#1677ff", fillOpacity: 0.12, interactive: false,
      }).addTo(map);
      dot = L.circleMarker(point, {
        radius: 8, color: "#ffffff", weight: 3,
        fillColor: "#1677ff", fillOpacity: 1,
      }).addTo(map).bindPopup("Your live location");
    } else {
      dot.setLatLng(point);
      accuracyCircle.setLatLng(point).setRadius(position.coords.accuracy);
    }
    if (following) centerOnUser(firstFix);
    showStatus();
  }

  function stop() {
    generation++;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  function onError(error) {
    if (error.code === 1) {
      blocked = true;
      stop();
      lastError = "Location blocked. Allow location access, then tap My location.";
    } else {
      lastError = error.code === 3
        ? "Waiting for GPS. Move to an open area; retrying…"
        : "Location unavailable. Check Location Services; retrying…";
    }
    showStatus();
  }

  function isCurrent(requestGeneration) {
    return !disposed && !blocked && !document.hidden && generation === requestGeneration;
  }

  function start() {
    if (disposed || document.hidden) return;
    if (!window.isSecureContext || !navigator.geolocation) {
      blocked = true;
      lastError = "Location needs HTTPS and a browser with location support.";
      showStatus();
      return;
    }
    stop();
    blocked = false;
    lastError = "";
    const requestGeneration = generation;
    watchId = navigator.geolocation.watchPosition(
      (position) => { if (isCurrent(requestGeneration)) onPosition(position); },
      (error) => { if (isCurrent(requestGeneration)) onError(error); },
      options,
    );
    showStatus();
  }

  function requestFreshPosition() {
    if (disposed || blocked || document.hidden || watchId === null || pendingRequest !== null) return;
    const requestGeneration = generation;
    pendingRequest = requestGeneration;
    navigator.geolocation.getCurrentPosition((position) => {
      pendingRequest = null;
      if (isCurrent(requestGeneration)) onPosition(position);
    }, (error) => {
      pendingRequest = null;
      if (isCurrent(requestGeneration)) onError(error);
    }, options);
  }

  function onRecenter() {
    setFollowing(true);
    if (blocked || watchId === null) start();
    centerOnUser();
    if (!latest || Date.now() - latest.timestamp >= 5000) requestFreshPosition();
  }

  function onDrag() { setFollowing(false); }
  function onPageHide() { stop(); showStatus(); }
  function onVisibilityChange() {
    if (document.hidden) onPageHide();
    else if (!blocked) start();
  }
  function onPageShow() { if (!blocked && watchId === null) start(); }

  button.addEventListener("click", onRecenter);
  map.on("dragstart", onDrag);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  const timer = window.setInterval(() => {
    if (disposed || document.hidden) return;
    showStatus();
    if (!latest || Date.now() - latest.timestamp >= 5000) requestFreshPosition();
  }, 5000);

  function dispose() {
    disposed = true;
    stop();
    window.clearInterval(timer);
    button.removeEventListener("click", onRecenter);
    map.off("dragstart", onDrag);
    map.off("unload", dispose);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
    if (dot) map.removeLayer(dot);
    if (accuracyCircle) map.removeLayer(accuracyCircle);
  }

  map.on("unload", dispose);
  setFollowing(true);
  start();
  return dispose;
}
