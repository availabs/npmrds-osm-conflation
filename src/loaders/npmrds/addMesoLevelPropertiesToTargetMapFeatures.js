/* eslint no-restricted-syntax: 0, no-continue: 0 */

const _ = require('lodash');
const turf = require('@turf/turf');
const turfHelpers = require('@turf/helpers');

const FeaturesTopographicalSorter = require('../../utils/FeaturesTopographicalSorter');

const {
  MESO_LEVEL_FEATURES_SORTING_BY_NETWORK_METADATA,
  MESO_LEVEL_FEATURES_SORTING_BY_DIRECTION_AND_PROPERTIES
} = require('../constants');

const transformNpmrdsFeaturesToEdgeInfoObjects = features => {
  const nodeIds = {};
  let nodeIdSeq = 1;

  const edgeInfo = features.reduce(
    (
      acc,
      {
        id,
        properties: {
          start_longitude,
          start_latitude,
          end_longitude,
          end_latitude
        },
        geometry: { coordinates }
      }
    ) => {
      /* eslint-disable no-param-reassign */
      start_longitude = start_longitude || _.first(coordinates)[0];
      start_latitude = start_latitude || _.first(coordinates)[1];

      end_longitude = end_longitude || _.last(coordinates)[0];
      end_latitude = end_latitude || _.last(coordinates)[1];
      /* eslint-enable no-param-reassign */

      const fromNodeCoords = `${start_longitude}|${start_latitude}`;
      const toNodeCoords = `${end_longitude}|${end_latitude}`;

      const fromNodeId =
        nodeIds[fromNodeCoords] || (nodeIds[fromNodeCoords] = nodeIdSeq++);
      const toNodeId =
        nodeIds[toNodeCoords] || (nodeIds[toNodeCoords] = nodeIdSeq++);

      acc.push({ id, fromNodeId, toNodeId });

      return acc;
    },
    []
  );

  return edgeInfo;
};

const sortFeaturesUsingNetworkProperties = featuresById => {
  try {
    const features = _.values(featuresById);

    const edgeInfoObjects = transformNpmrdsFeaturesToEdgeInfoObjects(features);
    const sortedFeatures = FeaturesTopographicalSorter.createTopoSortedChains(
      edgeInfoObjects
    );

    if (_.isNil(sortedFeatures)) {
      return null;
    }

    return {
      sortMethod: MESO_LEVEL_FEATURES_SORTING_BY_NETWORK_METADATA,
      sortedFeatures: sortedFeatures.map(chain =>
        chain.map(({ id }) => featuresById[id])
      )
    };
  } catch (err) {
    return null;
  }
};

const sortFeaturesUsingDirectionAndRoadOrder = featuresById => {
  const features = _.values(featuresById);

  if (
    features.some(({ properties: { direction, road_order } }) =>
      _.isNil(direction && road_order)
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
      _.sortBy(dirFeatures, '.properties.road_order')
    )
  };
};

const getChainBearing = chain => {
  const flattenedCoords = _(chain)
    .map('geometry.coordinates')
    .flattenDeep()
    .value();

  const [startLon, startLat] = flattenedCoords;

  const [endLon, endLat] = flattenedCoords.slice(-2);

  const startPoint = turfHelpers.point([startLon, startLat]);
  const endPoint = turfHelpers.point([endLon, endLat]);

  const bearing = _.round(turf.bearing(startPoint, endPoint), { final: true });

  return bearing;
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
      sortFeaturesUsingNetworkProperties(featuresById) ||
      sortFeaturesUsingDirectionAndRoadOrder(featuresById) ||
      {};

    if (Array.isArray(sortedFeatures)) {
      for (let i = 0; i < sortedFeatures.length; ++i) {
        const chain = sortedFeatures[i];

        const targetMapMesoLevelBearing = getChainBearing(chain);

        for (let j = 0; j < chain.length; ++j) {
          const { id } = chain[j];

          dbService.updateTargetMapMesoLevelProperties({
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
