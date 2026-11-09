import { createCampusMap } from "./map.js";
import { setupLocation } from "./location.js";
import { setupSearch } from "./search.js";

const campusMap = createCampusMap();

setupLocation(campusMap.map);
setupSearch(campusMap);