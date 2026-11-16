import { createCampusMap } from "./map.js";
import { setupLocation } from "./location.js";
import { setupSearch } from "./search.js";

import { setupLocationDetails } from "./locationDetails.js";
import { setupWashrooms } from "./washrooms.js";

const campusMap = createCampusMap();
setupWashrooms(campusMap);

setupLocation(campusMap.map);
const locationDetails = setupLocationDetails(campusMap);
setupSearch(campusMap, locationDetails);
