// See https://docs.microsoft.com/en-us/bingmaps/articles/bing-maps-tile-system#tile-coordinates-and-quadkeys

const _ = require('lodash');

const getGeoProximityKeyPrefix = ({ geometry: { coordinates } }) => {
  const [lon, lat] = _.flattenDeep(coordinates);

  const p_lon = _.round(Math.abs(+lon * 100000)).toString(2);
  const p_lat = _.round(Math.abs(+lat * 100000)).toString(2);

  const interleaved_coords = p_lon
    .split('')
    .reduce((acc, c, i) => `${acc}${c || 0}${p_lat[i] || 0}`, '');

  return interleaved_coords;
};

module.exports = getGeoProximityKeyPrefix;
