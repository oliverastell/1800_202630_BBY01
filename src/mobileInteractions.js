const holdDelay = 450;
const movementLimit = 10;
const clickSuppressTime = 800;

// Calls `onHold({ lngLat, point })` when a single finger is held still on the
// map (not on a pin or popup). Used so touch users drop a pin by holding.
export function enableMapHold(map, onHold) {
  const container = map.getCanvasContainer();
  let press = null;
  let held = false;

  function cancel() {
    if (press) clearTimeout(press.timer);
    press = null;
  }

  container.addEventListener("touchstart", event => {
    cancel();
    held = false;
    if (event.touches.length !== 1
        || event.target.closest?.(".holdable-pin, .maplibregl-popup")) return;
    const touch = event.touches[0];
    press = {
      id: touch.identifier,
      x: touch.clientX,
      y: touch.clientY,
      timer: setTimeout(() => {
        if (!press) return;
        const rect = container.getBoundingClientRect();
        const point = [press.x - rect.left, press.y - rect.top];
        press = null;
        held = true;
        onHold({ lngLat: map.unproject(point), point });
      }, holdDelay),
    };
  }, { passive: true });

  container.addEventListener("touchmove", event => {
    if (!press) return;
    const touch = Array.from(event.touches).find(touch => touch.identifier === press.id);
    if (event.touches.length !== 1 || !touch
        || Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > movementLimit) cancel();
  }, { passive: true });
  container.addEventListener("touchend", event => {
    // Lifting the finger after a hold must not click (which would close the new pin's popup).
    if (held && event.cancelable) event.preventDefault();
    held = false;
    cancel();
  }, { passive: false });
  container.addEventListener("touchcancel", cancel);
  map.on("movestart", event => { if (event.originalEvent) cancel(); });
}

// True for a few hundred ms after a touch on the map, so a map click can be
// recognised as coming from a finger tap rather than a mouse.
export function trackRecentTouch(element) {
  let lastTouchAt = -Infinity;
  const mark = () => { lastTouchAt = performance.now(); };
  element.addEventListener("touchstart", mark, { passive: true });
  element.addEventListener("touchend", mark, { passive: true });
  return () => performance.now() - lastTouchAt < clickSuppressTime;
}

// On touch screens a pin only responds to a long press, which runs `activate`
// (e.g. shows its popup). Quick taps are ignored entirely, so they neither open
// the pin nor fall through to the map and drop a new location marker.
// Mouse and keyboard clicks keep working as normal.
export function enablePinHold(element, activate = () => element.click()) {
  element.classList.add("holdable-pin");
  let press = null;
  let suppressClickUntil = 0;

  function cancel() {
    if (press) clearTimeout(press.timer);
    press = null;
  }

  element.addEventListener("touchstart", event => {
    cancel();
    suppressClickUntil = performance.now() + clickSuppressTime;
    if (event.touches.length !== 1) return;
    const touch = event.changedTouches[0];
    press = {
      id: touch.identifier,
      x: touch.clientX,
      y: touch.clientY,
      timer: setTimeout(() => {
        if (!press || !element.isConnected || element.hidden) return;
        activate();
      }, holdDelay),
    };
  }, { passive: true });

  element.addEventListener("touchmove", event => {
    if (!press) return;
    const touch = Array.from(event.touches).find(touch => touch.identifier === press.id);
    if (event.touches.length !== 1 || !touch
        || Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > movementLimit) cancel();
  }, { passive: true });

  element.addEventListener("touchcancel", cancel);

  element.addEventListener("touchend", event => {
    // Cancelling touchend stops the browser from turning the tap into a click.
    suppressClickUntil = performance.now() + clickSuppressTime;
    if (press && event.cancelable) event.preventDefault();
    cancel();
  }, { passive: false });

  // Backup for browsers that still send a click after a touch: swallow it here
  // so neither the pin's handlers nor the map's click handler receive it.
  element.addEventListener("click", event => {
    const fromTouch = event.pointerType === "touch"
      || event.sourceCapabilities?.firesTouchEvents
      || performance.now() < suppressClickUntil;
    if (!event.detail || !fromTouch) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  // Stop the long-press context menu / callout from appearing over the map.
  element.addEventListener("contextmenu", event => {
    if (press || performance.now() < suppressClickUntil) event.preventDefault();
  });
}
