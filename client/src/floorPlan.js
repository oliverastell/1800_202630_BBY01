const floorFiles = { sw1: { 1: "/data/sw1f1-rooms.geojson" } };
const pendingFloors = new Map();
const svgNS = "http://www.w3.org/2000/svg";

// Floor plan
export function loadFloorFeatures(buildingId, level) {
  const url = floorFiles[buildingId]?.[level];
  if (!url) return Promise.reject(new Error("Floor plan is unavailable"));
  if (!pendingFloors.has(url)) {
    pendingFloors.set(url, fetch(url).then(response => {
      if (!response.ok) throw new Error("Floor plan could not be loaded");
      return response.json();
    }).then(data => data.features.filter(feature =>
      feature.properties?.building === buildingId && feature.properties?.level === level
    )).catch(error => {
      pendingFloors.delete(url);
      throw error;
    }));
  }
  return pendingFloors.get(url);
}

export function renderFloorPlan(container, features) {
  const positions = features.flatMap(feature => {
    const coordinates = feature.geometry?.coordinates;
    if (feature.geometry?.type === "Point") return [coordinates];
    if (feature.geometry?.type === "Polygon") return coordinates.flat();
    return [];
  });
  if (!positions.length) throw new Error("Floor plan has no geometry");

  const longitude = positions.map(point => point[0]);
  const latitude = positions.map(point => point[1]);
  const minLng = Math.min(...longitude);
  const minLat = Math.min(...latitude);
  const maxLat = Math.max(...latitude);
  const scale = 1000000;
  const longitudeScale = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const project = ([lng, lat]) => [
    (lng - minLng) * longitudeScale * scale + 18,
    (maxLat - lat) * scale + 18
  ];
  const width = (Math.max(...longitude) - minLng) * longitudeScale * scale + 36;
  const height = (maxLat - minLat) * scale + 36;
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "SW1 first floor plan with room and area labels");
  svg.classList.add("floor-plan-svg", "d-block", "h-auto");

  const labels = [];
  features.forEach((feature, index) => {
    const { geometry, properties = {} } = feature;
    if (geometry?.type === "Polygon") {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", geometry.coordinates.map(ring =>
        ring.map((point, pointIndex) => {
          const [x, y] = project(point);
          return `${pointIndex ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
        }).join(" ") + " Z"
      ).join(" "));
      path.setAttribute("class", `floor-plan-area floor-plan-${properties.kind || "other"}`);
      path.dataset.featureIndex = index;
      const title = document.createElementNS(svgNS, "title");
      title.textContent = [properties.name, properties.use || properties.kind].filter(Boolean).join(" · ");
      path.append(title);
      svg.append(path);
      if (properties.name) {
        const outline = geometry.coordinates[0].map(project);
        const left = Math.min(...outline.map(point => point[0]));
        const right = Math.max(...outline.map(point => point[0]));
        const top = Math.min(...outline.map(point => point[1]));
        const bottom = Math.max(...outline.map(point => point[1]));
        if (right - left >= 12 && bottom - top >= 8) {
          const label = document.createElementNS(svgNS, "text");
          label.setAttribute("x", (left + right) / 2);
          label.setAttribute("y", (top + bottom) / 2);
          label.setAttribute("class", "floor-plan-label");
          label.dataset.featureIndex = index;
          label.textContent = properties.name;
          labels.push(label);
        }
      }
    } else if (geometry?.type === "Point" && properties.name) {
      const [x, y] = project(geometry.coordinates);
      const label = document.createElementNS(svgNS, "text");
      label.setAttribute("x", x);
      label.setAttribute("y", y);
      label.setAttribute("class", "floor-plan-label");
      label.dataset.featureIndex = index;
      label.textContent = properties.name;
      labels.push(label);
    }
  });
  svg.append(...labels);
  container.replaceChildren(svg);
}
