import { createCampusMap } from "./map.js";
import { setupLocation } from "./location.js";
import { setupSearch } from "./search.js";

import { setupLocationDetails } from "./locationDetails.js";
import { setupMapFilters } from "./mapFilters.js";
import {redirectToWelcomeIfNecessary} from "./redirectToWelcome.js";

const campusMap = createCampusMap();
setupMapFilters(campusMap);

setupLocation(campusMap.map);
const locationDetails = setupLocationDetails(campusMap);
setupSearch(campusMap, locationDetails);


redirectToWelcomeIfNecessary()