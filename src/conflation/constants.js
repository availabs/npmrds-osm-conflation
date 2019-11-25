const PRECISION = 6;
const IN_KILOMETERS = {
  units: 'kilometers'
};
const OSM = 'osm';

const SPLIT_BUFF_KM = 10 / 1000;
const LENGTH_RATIO_THRESHOLD = 0.5;

// https://github.com/sharedstreets/sharedstreets-types/blob/3c1d5822ff4943ae063f920e018dd3e349213c8c/index.ts#L33-L44
const shstOsmWayRoadClassRankings = {
  Motorway: 0,
  Trunk: 1,
  Primary: 2,
  Secondary: 3,
  Tertiary: 4,
  Residential: 5,
  Unclassified: 6,
  Service: 7,
  Other: 8
};

module.exports = {
  PRECISION,
  IN_KILOMETERS,
  OSM,
  SPLIT_BUFF_KM,
  LENGTH_RATIO_THRESHOLD,
  shstOsmWayRoadClassRankings
};
