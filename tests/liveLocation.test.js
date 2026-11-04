import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { startLiveLocation } from "../client/src/liveLocation.js";

function setup(t, secure = true) {
  let now = 100000;
  let tick;
  let timerCleared = false;
  const watches = [];
  const polls = [];
  const cleared = [];
  const layers = [];
  const centers = [];
  const document = new EventTarget();
  document.hidden = false;
  const window = new EventTarget();
  window.isSecureContext = secure;
  window.setInterval = (callback) => { tick = callback; return 1; };
  window.clearInterval = () => { timerCleared = true; };
  const navigator = { geolocation: {
    watchPosition(success, error, options) {
      watches.push({ success, error, options });
      return watches.length - 1;
    },
    clearWatch(id) { cleared.push(id); },
    getCurrentPosition(success, error, options) { polls.push({ success, error, options }); },
  } };
  const originals = new Map();
  for (const [name, value] of Object.entries({ window, document, navigator })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  t.mock.method(Date, "now", () => now);
  const map = new EventEmitter();
  map.setMaxBounds = (bounds) => { assert.equal(bounds, null); };
  map.setView = (point, zoom) => { centers.push({ point, zoom }); };
  map.panTo = (point) => { centers.push({ point }); };
  map.removeLayer = (layer) => { layer.removed = true; };
  function layer(point, options) {
    const result = {
      point, options,
      addTo() { layers.push(this); return this; },
      bindPopup() { return this; },
      setLatLng(value) { this.point = value; return this; },
      setRadius(value) { this.options.radius = value; return this; },
      setStyle(value) { Object.assign(this.options, value); },
    };
    return result;
  }
  const button = new EventTarget();
  button.setAttribute = (name, value) => { button[name] = value; };
  const status = { textContent: "" };
  const dispose = startLiveLocation(map, { circle: layer, circleMarker: layer }, button, status);
  t.after(() => {
    dispose();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  return {
    watches, polls, cleared, layers, centers, document, window, map, button, status, dispose,
    advance(ms) { now += ms; tick(); },
    fix(lat = 49.248, lng = -123.001, accuracy = 8, timestamp = now) {
      return { timestamp, coords: { latitude: lat, longitude: lng, accuracy } };
    },
    get timerCleared() { return timerCleared; },
  };
}

test("successive GPS fixes move the dot and accuracy circle, including outside campus", (t) => {
  const tracker = setup(t);
  assert.deepEqual(tracker.watches[0].options, {
    enableHighAccuracy: true, maximumAge: 0, timeout: 20000,
  });
  tracker.watches[0].success(tracker.fix());
  assert.equal(tracker.layers.length, 2);
  assert.equal(tracker.centers[0].zoom, 18);
  tracker.advance(1000);
  tracker.watches[0].success(tracker.fix(49.28, -123.12, 15));
  assert.deepEqual(tracker.layers[1].point, [49.28, -123.12]);
  assert.deepEqual(tracker.layers[0].point, [49.28, -123.12]);
  assert.equal(tracker.layers[0].options.radius, 15);
  assert.equal(tracker.layers.length, 2);
  assert.equal(tracker.centers.length, 2);
  assert.match(tracker.status.textContent, /Live location.*±15 m/);
});

test("dragging pauses following while updates continue; My location resumes following", (t) => {
  const tracker = setup(t);
  tracker.watches[0].success(tracker.fix());
  tracker.map.emit("dragstart");
  tracker.advance(1000);
  tracker.watches[0].success(tracker.fix(49.249));
  assert.equal(tracker.centers.length, 1);
  assert.equal(tracker.layers[1].point[0], 49.249);
  assert.equal(tracker.button["aria-pressed"], "false");
  tracker.button.dispatchEvent(new Event("click"));
  assert.equal(tracker.centers.length, 2);
  assert.equal(tracker.button["aria-pressed"], "true");
});

test("a quiet watch gets a fresh fix without overlapping requests or restarting GPS", (t) => {
  const tracker = setup(t);
  tracker.watches[0].success(tracker.fix());
  tracker.advance(5000);
  tracker.advance(5000);
  assert.equal(tracker.polls.length, 1);
  assert.equal(tracker.watches.length, 1);
  assert.equal(tracker.cleared.length, 0);
  tracker.polls[0].success(tracker.fix(49.249));
  assert.equal(tracker.layers[1].point[0], 49.249);
  tracker.advance(5000);
  assert.equal(tracker.polls.length, 2);
});

test("an older fallback fix cannot move the dot back to a previous position", (t) => {
  const tracker = setup(t);
  const oldFix = tracker.fix();
  tracker.advance(5000);
  tracker.watches[0].success(tracker.fix(49.249));
  tracker.polls[0].success(oldFix);
  assert.equal(tracker.layers[1].point[0], 49.249);
});

test("permission denial stops requests and the location button allows retry", (t) => {
  const tracker = setup(t);
  tracker.watches[0].error({ code: 1 });
  tracker.advance(30000);
  assert.match(tracker.status.textContent, /Location blocked/);
  assert.equal(tracker.polls.length, 0);
  assert.deepEqual(tracker.cleared, [0]);
  tracker.button.dispatchEvent(new Event("click"));
  assert.equal(tracker.watches.length, 2);
  tracker.watches[1].success(tracker.fix());
  assert.match(tracker.status.textContent, /Live location/);
});

test("temporary errors show stale status and recover on a fresh fix", (t) => {
  const tracker = setup(t);
  tracker.watches[0].success(tracker.fix());
  tracker.watches[0].error({ code: 3 });
  assert.match(tracker.status.textContent, /Waiting for GPS/);
  assert.equal(tracker.layers[1].options.fillColor, "#6c757d");
  tracker.advance(5000);
  tracker.polls[0].success(tracker.fix());
  assert.equal(tracker.layers[1].options.fillColor, "#1677ff");
  assert.match(tracker.status.textContent, /Live location/);
});

test("hiding the page pauses tracking and ignores late fixes before resuming", (t) => {
  const tracker = setup(t);
  tracker.document.hidden = true;
  tracker.document.dispatchEvent(new Event("visibilitychange"));
  tracker.watches[0].success(tracker.fix());
  tracker.advance(30000);
  assert.equal(tracker.layers.length, 0);
  assert.equal(tracker.polls.length, 0);
  tracker.document.hidden = false;
  tracker.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(tracker.watches.length, 2);
  tracker.watches[1].success(tracker.fix());
  assert.equal(tracker.layers.length, 2);
});

test("an insecure page explains why tracking cannot start", (t) => {
  const tracker = setup(t, false);
  tracker.advance(5000);
  assert.match(tracker.status.textContent, /HTTPS/);
  assert.equal(tracker.watches.length, 0);
  assert.equal(tracker.polls.length, 0);
});

test("map removal clears tracking, layers, listeners, and late callbacks", (t) => {
  const tracker = setup(t);
  tracker.watches[0].success(tracker.fix());
  tracker.advance(5000);
  tracker.map.emit("unload");
  tracker.polls[0].success(tracker.fix(49.249));
  tracker.button.dispatchEvent(new Event("click"));
  tracker.window.dispatchEvent(new Event("pageshow"));
  assert.equal(tracker.timerCleared, true);
  assert.equal(tracker.watches.length, 1);
  assert.equal(tracker.layers[1].point[0], 49.248);
  assert.ok(tracker.layers.every((layer) => layer.removed));
});
