/* eslint no-restricted-syntax: 0 */

const turf = require('@turf/turf');
const _ = require('lodash');

const {
  NORTHBOUND,
  EASTBOUND,
  SOUTHBOUND,
  WESTBOUND
} = require('../constants/directionOfTravel');

const NORTH_SOUTH = 'NORTH_SOUTH';
const EAST_WEST = 'EAST_WEST';

const getMegaLevelDirectionsOfTravel = shstMatchedFeatures => {
  const featureCollection = turf.featureCollection(shstMatchedFeatures);
  const [minLon, minLat, maxLon, maxLat] = turf.bbox(featureCollection);

  const northSouthDist = turf.distance(
    turf.point([minLon, minLat]),
    turf.point([minLon, maxLat]),
    { final: true }
  );
  const eastWestDist = turf.distance(
    turf.point([minLon, minLat]),
    turf.point([maxLon, minLat]),
    { final: true }
  );

  return northSouthDist > eastWestDist ? NORTH_SOUTH : EAST_WEST;
};

const getMegaLevelDirectionOfTravel = (
  megaLevelDirectionsOfTravel,
  matchedTargetMapMesoLevelBearing
) => {
  if (megaLevelDirectionsOfTravel === NORTH_SOUTH) {
    return matchedTargetMapMesoLevelBearing <= 90 ||
      matchedTargetMapMesoLevelBearing > 270
      ? NORTHBOUND
      : SOUTHBOUND;
  }
  return matchedTargetMapMesoLevelBearing <= 180 ? EASTBOUND : WESTBOUND;
};

const addMegaLevelMetadata = dbService => {
  const iterator = dbService.makeMatchedFeaturesGroupedAtTargetMapMegaLevelIterator();

  for (const { shstMatchedFeatures } of iterator) {
    if (Array.isArray(shstMatchedFeatures) && shstMatchedFeatures.length) {
      const megaLevelDirectionsOfTravel = getMegaLevelDirectionsOfTravel(
        shstMatchedFeatures
      );

      for (let i = 0; i < shstMatchedFeatures.length; ++i) {
        const {
          id,
          properties: {
            targetMapId,
            matchedTargetMapMesoLevelBearing,
            matchedTargetMapMesoIdx
          }
        } = shstMatchedFeatures[i];

        const matchedTargetMapMegaLevelDirectionOfTravel = getMegaLevelDirectionOfTravel(
          megaLevelDirectionsOfTravel,
          matchedTargetMapMesoLevelBearing
        );

        const separator = _.isNil(matchedTargetMapMesoIdx) ? '!' : '|';

        const matchedTargetMapMicroId = `${targetMapId}${separator}${matchedTargetMapMegaLevelDirectionOfTravel}`;

        dbService.upsertMatchedFeatureMetadata(id, {
          matchedTargetMapMegaLevelDirectionOfTravel,
          matchedTargetMapMicroId
        });
      }
    }
  }
};

module.exports = addMegaLevelMetadata;
