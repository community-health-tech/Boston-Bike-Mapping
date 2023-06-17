const CITY_CENTER = [42.33, -71.1];
const UNEMPLOYMENT_LEVEL_CATEGORIES = [4, 8, 14, 19, 29];
const EXCLUDED_TRACTS = ['25025990101', '25025980101', '25025981501'];
// const EXCLUDED_NEIGHBORHOODS = ['Harbor Islands'];
const EXCLUDED_NEIGHBORHOODS = [];
const EXCLUDED_NEIGHBORHOOD_LABELS = ['Bay Village', 'Leather District', 'Chinatown', 'Waterfront',
                                      'West End'];
const COLOR_MAPPINGS = {
  colorLevel0: '#f9fbe7',
  colorLevel1: '#f9fbe7',
  colorLevel2: '#85e70e',
  colorLevel3: '#136043',
  colorLevel4: '#f5bc06',
  colorLevel5: '#b90cec',
  colorLevel6: '#91a21f',
};

const JURISDICTION_MAPPING = {
  'A': 'All', //TODO
  '0': 'Unaccepted by city or town',
  '1': 'Massachusetts Highway Department',
  '2': 'City or Town accepted road',
  '3': 'Department of Conservation and Recreation',
  '4': 'Massachusetts Turnpike Authority',
  '5': 'Massachusetts Port Authority',
  'B': 'State College or University',
  'H': 'Private',
  'M': 'MBTA',
};

const FACILITY_TYPE_MAPPING = {
  'BL': 'Bike Lane',
  'BL-PEAKBUS': 'Bike lane/peak hour bus lane',
  'BFBL': 'Buffered bike lane',
  'BLSL': 'Bike lane on one side, shared lane on the other side',
  'CFBL': 'Contraflow bike lane',
  'SBL': 'Separated bike lane',
  'SBLBL': 'Separated bike lane one side, bike lane on the other side',
  'SBLSL': 'Separated bike lane one side, shared lane on the other side',
  'CFSBL': 'Contraflow separated bike lane',
  'SLM': 'Shared lane markings or Shared Bus Lane',
  'SLMTC': 'Shared lane markings on a traffic calmed street',
  'PED': 'Pedestrianised street',
  'SUP': 'Shared Use Path',
  'SUPN': 'Natural Surface Shared Use Path ',
  'SUPM': 'Minor Shared Use Path',
  'WALK': 'Walkway',
};


const MOE_THRESHOLD = 20;

let map_left, map_right;
let facilityDataLayer;
let cityFacilityShapes = {};
let neighborhoodShapes = {};
let activeFacilityId = undefined;
let mapInfobox;

function initMap() {
  mapInfobox = document.getElementById('mapInfoBox');
  loadMapData();
  initializeEventListeners();
}

function loadMapData() {
  const bostonNeighborhoodsData = 'static/maps/boston_neighborhoods.geojson';
  const existingBikeNetwork = 'static/json2020/Existing_Bike_Network_2023.geojson';
  const mapDataUriList = [bostonNeighborhoodsData, existingBikeNetwork];

  const latlng = new google.maps.LatLng(CITY_CENTER[0], CITY_CENTER[1]);
  const govBikePathOptions = {
    zoom: 12, center: latlng, disableDefaultUI: true, zoomControl: false,
  };

  const bikePathOptions = {
    zoom: 12, center: latlng, disableDefaultUI: true, zoomControl: true, zoomControlOptions: {
      position: google.maps.ControlPosition.RIGHT_CENTER,
    },
  };
  map_left = new google.maps.Map(document.getElementById('map_left'), govBikePathOptions);

  map_right = new google.maps.Map(document.getElementById('map_right'), bikePathOptions);
  drawNeighborhoods(mapDataUriList[0], map_right);

  const bikeLayer = new google.maps.BicyclingLayer();
  bikeLayer.setMap(map_right);

  Promise.all(mapDataUriList)
    .then((values) => {
      neighborhoodShapes = drawNeighborhoods(values[0], map_left);
        return drawFacilities(values[1]);
    })
    .then(() => {
      colorizeFacilityMap('all');
    })
    .catch((error) => {
      console.error('Error loading map data:', error);
    });

  let isProgrammaticZoom = false;
  let isProgrammaticPan = false;

// Add dragend event listener to left map
  google.maps.event.addListener(map_left, 'drag', function() {
    if (!isProgrammaticPan) {
      isProgrammaticPan = true;
      const center = map_left.getCenter();
      map_right.setCenter(center);
    } else {
      isProgrammaticPan = false;
    }
  });

// Add zoom_changed event listener to left map
  google.maps.event.addListener(map_left, 'zoom_changed', function() {
    if (!isProgrammaticZoom) {
      isProgrammaticZoom = true;
      const zoom = map_left.getZoom();
      const center = map_left.getCenter();
      map_right.setZoom(zoom);
      map_right.setCenter(center);
    } else {
      isProgrammaticZoom = false;
    }
  });

// Add dragend event listener to right map
  google.maps.event.addListener(map_right, 'drag', function() {
    if (!isProgrammaticPan) {
      isProgrammaticPan = true;
      var center = map_right.getCenter();
      map_left.setCenter(center);
    } else {
      isProgrammaticPan = false;
    }
  });

// Add zoom_changed event listener to right map
  google.maps.event.addListener(map_right, 'zoom_changed', function() {
    if (!isProgrammaticZoom) {
      isProgrammaticZoom = true;
      var zoom = map_right.getZoom();
      var center = map_right.getCenter();
      map_left.setZoom(zoom);
      map_left.setCenter(center);
    } else {
      isProgrammaticZoom = false;
    }
  });
}


function initializeEventListeners() {
  document.getElementById('buttonRefreshView').addEventListener('click', onRefreshButtonClicked);
  document.getElementById('selectHealthFacilities').addEventListener('change', onDataFilterChanged);
}

function onRefreshButtonClicked() {
  const facility_type = document.getElementById('selectHealthFacilities').value;
  console.log(facility_type)
    colorizeFacilityMap(facility_type)
  document.getElementById('buttonRefreshView').disabled = true;
}

function onDataFilterChanged() {
  document.getElementById('buttonRefreshView').disabled = false;
}

function drawFacilities(GeoJsonUrl) {
  return new Promise((resolve) => {
    facilityDataLayer = new google.maps.Data({map: map_left});
    facilityDataLayer.loadGeoJson(GeoJsonUrl, {}, (features) => {
      facilityDataLayer.addListener('mouseover', (event) => {
        highlightFacility(event.feature, 2);
      });
      facilityDataLayer.addListener('mouseout', setHighlightFacilityAsDefault);
      facilityDataLayer.addListener('click', onBikePathClicked);
      features.forEach((facilityFeature) => {
        const facilityId = getFacilityId(facilityFeature);
        cityFacilityShapes[facilityId] = facilityFeature;
      });
      resolve();
    });
  });
}

function getFacilityId(facilityFeature) {
    return facilityFeature.getProperty('FID');
}

function drawNeighborhoods(GeoJsonUrl, map) {
  let neighborhoodsDataLayer = new google.maps.Data({map: map});
  neighborhoodsDataLayer.loadGeoJson(GeoJsonUrl);
  const neighborhoodShapes = {};

  neighborhoodsDataLayer.addListener('addfeature', (event) => {
    const neighborhoodFeature = event.feature;
    const neighborhoodName = getNeighborhoodName(neighborhoodFeature);

    if (!EXCLUDED_NEIGHBORHOODS.includes(neighborhoodName)) {
      neighborhoodShapes[neighborhoodName] =
        drawNeighborhoodBorders(neighborhoodFeature, neighborhoodName, neighborhoodsDataLayer);
    }
  });

  return neighborhoodShapes;
}

function getNeighborhoodName(neighborhoodFeature) {
  return neighborhoodFeature.getProperty('Name');
}

function drawNeighborhoodBorders(neighborhoodFeature, neighborhoodName, neighborhoodsDataLayer) {
  if (EXCLUDED_NEIGHBORHOODS.includes(neighborhoodName)) {
    console.log(neighborhoodName);
  } else {
    neighborhoodsDataLayer.overrideStyle(neighborhoodFeature, {
      fillColor: '#ffffff',
      fillOpacity: 0.0,
      strokeWeight: 1.5,
      strokeColor: '#4589ff',
      clickable: false,
    });
  }
  return neighborhoodFeature;
}

function colorizeFacilityMap(facility_type) {
  facilityDataLayer.setStyle((feature) => {
    let level = 5;
    let strokeWeight = 2;
    let strokeColor = 'rgb(117,19,215)';
    return {
      fillColor: getColorForLevel(level),
      fillOpacity: 0.4,
      strokeWeight: strokeWeight,
      strokeColor: strokeColor,
    };
  });
}

function getColorForLevel(level) {
  return COLOR_MAPPINGS[`colorLevel${level}`] || '#ffffff';
}

function onBikePathClicked(event) {
  const facilityId = event.feature.getProperty('FID');
  if (activeFacilityId === undefined) {
    activeFacilityId = facilityId;
    highlightFacility(event.feature, 5);
    showInfoBox(event.feature, 'existing_bike_network');
    hideGuideText();
  } else {
    if (activeFacilityId === facilityId) {
      activeFacilityId = undefined;
      setFacilityAsNotActive(event.feature);
      hideInfoBox(event.feature);
      showGuideText();
    } else {
      setFacilityAsNotActive(cityFacilityShapes[activeFacilityId]);
      activeFacilityId = facilityId;
      highlightFacility(event.feature, 10);
      showInfoBox(event.feature, 'existing_bike_network');
      hideGuideText();
    }
  }
}

function showInfoBox(facilityId, facility_type) {
  refreshInfoBoxData(facilityId, facility_type);
  mapInfobox.className = 'mapInfoBox visible';
}

function hideInfoBox() {
  mapInfobox.className = 'mapInfoBox hidden';
}

function refreshInfoBoxData(facilityFeature, facility_type) {
  const bikePathData = facilityFeature;

  if (bikePathData === undefined) {
    document.getElementById('infoBoxName').textContent = 'Missing data';
    document.getElementById('infoBoxDistrict').textContent = 'Missing data';
    document.getElementById('infoBoxAcres').textContent = 'Missing data';
    document.getElementById('infoBoxKeywords').textContent = 'Missing data';
  } else {
    const name = bikePathData.getProperty('STREET_NAM');
    const jurisdiction = bikePathData.getProperty('JURISDICTI');
    const length = bikePathData.getProperty('Shape_Leng');
    const type = bikePathData.getProperty('ExisFacil');
    document.getElementById('infoBoxName').textContent = name;
    document.getElementById('infoBoxDistrict').textContent = JURISDICTION_MAPPING[jurisdiction];
    document.getElementById('infoBoxAcres').textContent = length;
    document.getElementById('infoBoxKeywords').textContent = FACILITY_TYPE_MAPPING[type];
  }
}

function hideGuideText() {
  document.getElementById('mapGuideText').classList.add('hidden');
}

function showGuideText() {
  document.getElementById('mapGuideText').classList.remove('hidden');
}

function highlightFacility(facilityFeature, highlightWeight) {
  facilityDataLayer.overrideStyle(facilityFeature, {
    strokeWeight: highlightWeight,
  });
}

function setHighlightFacilityAsDefault(event) {
  const facilityId = getFacilityId(event.feature);
  if (facilityId !== activeFacilityId) {
    facilityDataLayer.revertStyle(event.feature);
  }
}

function setFacilityAsNotActive(facilityFeature) {
  facilityDataLayer.revertStyle(facilityFeature);
}

window.initMap = initMap;
