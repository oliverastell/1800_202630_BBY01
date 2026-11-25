import { createCampusMap } from "./map.js";
import { setupLocation } from "./location.js";
import { setupSearch } from "./search.js";

import { setupLocationDetails } from "./locationDetails.js";
import { setupMapFilters } from "./mapFilters.js";
import { loadBuildings } from "./buildings.js";
import {redirectToWelcomeIfNecessary} from "./redirectToWelcome.js";

const campusMap = createCampusMap();
const buildingsReady = loadBuildings();
setupMapFilters(campusMap, buildingsReady);

const userLocation = setupLocation(campusMap.map);
const locationDetails = setupLocationDetails({ ...campusMap, ...userLocation });
setupSearch(campusMap, locationDetails, buildingsReady);


redirectToWelcomeIfNecessary()
