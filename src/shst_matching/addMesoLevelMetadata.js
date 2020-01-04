/* eslint no-restricted-syntax: 0 */

const _ = require('lodash');

const {
  createTopoSortedChains
} = require('../utils/FeaturesTopographicalSorter');

const getChainBearing = require('../utils/getChainBearing');

const FOLLOWS_DIRECTION_BEARING_DIFF_THRESHOLD = 45;

const partitionShstMatchesByTargetMapMicroProtoId = shstMatchedFeatures =>
  shstMatchedFeatures.reduce((acc, shstMatchedFeature) => {
    const {
      properties: { matchedTargetMapMicroProtoId, matchedTargetMapMicroIdx }
    } = shstMatchedFeature;

    acc[matchedTargetMapMicroProtoId] = acc[matchedTargetMapMicroProtoId] || [];
    acc[matchedTargetMapMicroProtoId][
      matchedTargetMapMicroIdx
    ] = shstMatchedFeature;

    return acc;
  }, {});

const createSimplifiedMicroLevelEdges = shstMatchedFeaturesByTargetMapMicroProtoId =>
  Object.keys(shstMatchedFeaturesByTargetMapMicroProtoId).reduce((acc, id) => {
    const shstMatchedFeaturesChain = Array.isArray(
      shstMatchedFeaturesByTargetMapMicroProtoId[id]
    )
      ? shstMatchedFeaturesByTargetMapMicroProtoId[id].filter(
          elem => !_.isNil(elem)
        )
      : null;

    // FIXME: figure out why these are needed
    if (
      Array.isArray(shstMatchedFeaturesChain) &&
      shstMatchedFeaturesChain.length
    ) {
      const {
        properties: { shstFromIntersectionId: fromNodeId }
      } = _.first(shstMatchedFeaturesChain);

      const {
        properties: { shstToIntersectionId: toNodeId }
      } = _.last(shstMatchedFeaturesChain);

      acc.push({
        id,
        fromNodeId,
        toNodeId
      });
    }

    return acc;
  }, []);

const handleFailedNetworkBasedApproach = (dbService, shstMatchedFeatures) => {
  for (let i = 0; i < shstMatchedFeatures.length; ++i) {
    const {
      id,
      properties: {
        targetMapMicroLevelBearing,
        targetMapMesoLevelBearing,
        matchedTargetMapMicroLevelBearing
      }
    } = shstMatchedFeatures[i];

    if (
      !_.isNil(targetMapMicroLevelBearing) &&
      !_.isNil(matchedTargetMapMicroLevelBearing)
    ) {
      const bearingDiff = Math.abs(
        targetMapMicroLevelBearing - matchedTargetMapMicroLevelBearing
      );

      const matchFollowsTargetMapFeatureDirection =
        bearingDiff < FOLLOWS_DIRECTION_BEARING_DIFF_THRESHOLD;

      const matchedTargetMapMesoLevelBearing = matchFollowsTargetMapFeatureDirection
        ? targetMapMesoLevelBearing
        : (targetMapMesoLevelBearing + 180) % 360;

      dbService.upsertMatchedFeatureMetadata(id, {
        targetMapMesoLevelBearing,
        matchedTargetMapMesoLevelBearing,
        matchedTargetMapMesoIdx: null
      });
    }
  }
};

const addMesoLevelMetadata = dbService => {
  const iterator = dbService.makeMatchedFeaturesGroupedAtTargetMapMesoLevelIterator();

  for (const { shstMatchedFeatures } of iterator) {
    if (Array.isArray(shstMatchedFeatures) && shstMatchedFeatures.length) {
      const shstMatchedFeaturesByTargetMapMicroProtoId = partitionShstMatchesByTargetMapMicroProtoId(
        shstMatchedFeatures
      );

      const simplifiedMicroLevelEdges = createSimplifiedMicroLevelEdges(
        shstMatchedFeaturesByTargetMapMicroProtoId
      );

      try {
        const sortedSimplifiedMicroLevelEdges = createTopoSortedChains(
          simplifiedMicroLevelEdges
        );

        if (Array.isArray(sortedSimplifiedMicroLevelEdges)) {
          for (let i = 0; i < sortedSimplifiedMicroLevelEdges.length; ++i) {
            const edgesChain = sortedSimplifiedMicroLevelEdges[i];

            const matchedTargetMapMesoLevelChain = _(edgesChain)
              .map(({ id }) => shstMatchedFeaturesByTargetMapMicroProtoId[id])
              .flattenDeep()
              .value();

            const matchedTargetMapMesoLevelBearing = getChainBearing(
              matchedTargetMapMesoLevelChain
            );

            for (let j = 0; j < matchedTargetMapMesoLevelChain.length; ++j) {
              const { id } = matchedTargetMapMesoLevelChain[j];

              const matchedTargetMapMesoIdx = j;

              dbService.upsertMatchedFeatureMetadata(id, {
                matchedTargetMapMesoLevelBearing,
                matchedTargetMapMesoIdx
              });
            }
          }
        } else {
          handleFailedNetworkBasedApproach(dbService, shstMatchedFeatures);
        }
      } catch (err) {
        handleFailedNetworkBasedApproach(dbService, shstMatchedFeatures);
      }
    }
  }
};

module.exports = addMesoLevelMetadata;
