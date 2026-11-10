import { Marker, LngLatBounds } from "maplibre-gl";

export function setupLocation(map) {
  const campusBounds = new LngLatBounds([-123.00753, 49.23835], [-122.99517, 49.25815]);
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


}
