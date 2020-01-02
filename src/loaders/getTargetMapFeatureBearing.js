const _ = require('lodash');
const turf = require('@turf/turf');

const getTargetMapFeatureBearing = feature => {
  const { features: featurePoints } = turf.explode(feature);
  const startPoint = _.first(featurePoints);
  const endPoint = _.last(featurePoints);
  const targetMapMicroLevelBearing = _.round(
    turf.bearing(startPoint, endPoint, {
      final: true
    })
  );

  return targetMapMicroLevelBearing;
};

module.exports = getTargetMapFeatureBearing;
