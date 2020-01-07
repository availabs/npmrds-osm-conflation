const assert = require('assert');

const _ = require('lodash');
const turf = require('@turf/turf');
const turfHelpers = require('@turf/helpers');

const getChainBearing = chain => {
  const flattenedCoords = _(chain)
    .map('geometry.coordinates')
    .flattenDeep()
    .value();

  const [startLon, startLat] = flattenedCoords;

  const [endLon, endLat] = flattenedCoords.slice(-2);

  const startPoint = turfHelpers.point([startLon, startLat]);
  const endPoint = turfHelpers.point([endLon, endLat]);

  const bearing = _.round(turf.bearing(startPoint, endPoint, { final: true }));

  assert(bearing >= 0 && bearing <= 360);

  return bearing;
};

module.exports = getChainBearing;
