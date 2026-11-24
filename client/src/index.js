import { createCampusMap } from "./map.js";
import { setupLocation } from "./location.js";
import { setupSearch } from "./search.js";

import { setupLocationDetails } from "./locationDetails.js";
import { setupMapFilters } from "./mapFilters.js";

const campusMap = createCampusMap();
setupMapFilters(campusMap);

const userLocation = setupLocation(campusMap.map);
const locationDetails = setupLocationDetails({ ...campusMap, ...userLocation });
setupSearch(campusMap, locationDetails);
