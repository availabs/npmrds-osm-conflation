/* eslint no-restricted-syntax: 0, no-continue: 0 */

const _ = require('lodash');
const getChainBearing = require('../../utils/getChainBearing');

const {
  MESO_LEVEL_FEATURES_SORTING_BY_DIRECTION_AND_PROPERTIES
} = require('../constants');

const sortFeaturesUsingDirectionAndRoadOrder = featuresById => {
  const features = _.values(featuresById);

  if (
    features.some(({ properties: { direction, beg_mp } }) =>
      _.isNil(direction && beg_mp)
    )
  ) {
    return null;
  }

  const featuresPartitionedByDirection = _.values(featuresById).reduce(
    (acc, feature) => {
      const {
        properties: { direction }
      } = feature;

      acc[direction] = acc[direction] || [];
      acc[direction].push(feature);

      return acc;
    },
    {}
  );

  const directions = Object.keys(featuresPartitionedByDirection);
  const numDirections = directions.length;

  if (numDirections > 2) {
    return null;
  }

  return {
    sortMethod: MESO_LEVEL_FEATURES_SORTING_BY_DIRECTION_AND_PROPERTIES,
    sortedFeatures: _.values(featuresPartitionedByDirection).map(dirFeatures =>
      _.sortBy(dirFeatures, ({ properties: { beg_mp, direction } }) =>
        direction === 1 ? beg_mp : -beg_mp
      )
    )
  };
};

const addMesoLevelProperties = dbService => {
  const iterator = dbService.makeTargetMapFeaturesGroupedByTargetMapMesoIdIterator();

  for (const { features } of iterator) {
    if (!(Array.isArray(features) && features.length)) {
      continue;
    }

    const featuresById = features.reduce((acc, feature) => {
      const { id } = feature;
      acc[id] = feature;
      return acc;
    }, {});

    const { sortMethod, sortedFeatures = null } =
      sortFeaturesUsingDirectionAndRoadOrder(featuresById) || {};

    if (Array.isArray(sortedFeatures)) {
      for (let i = 0; i < sortedFeatures.length; ++i) {
        const chain = sortedFeatures[i];

        const targetMapMesoLevelBearing = getChainBearing(chain);

        for (let j = 0; j < chain.length; ++j) {
          const { id } = chain[j];

          dbService.insertTargetMapMesoLevelProperties({
            id,
            targetMapMesoLevelIdx: j,
            targetMapMesoLevelSortMethod: sortMethod,
            targetMapMesoLevelBearing
          });
        }
      }
    }
  }
};

module.exports = addMesoLevelProperties;
