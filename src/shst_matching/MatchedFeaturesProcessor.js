const _ = require('lodash');

const {
  createTopoSortedChain,
  createTopoSortedChains
} = require('../utils/FeaturesTopographicalSorter');

const getChainBearing = require('../utils/getChainBearing');

const targetMapPropertiesRestoreLookup = {};

const updateTargetMapPropertiesRestoreLookup = targetMapFeatures =>
  Object.assign(
    targetMapPropertiesRestoreLookup,
    Object.keys(_.first(targetMapFeatures).properties)
      .filter(prop => /^targetMap/.test(prop))
      .reduce((acc, targetMapProp) => {
        const shstMatchProp = `pp_${targetMapProp.toLowerCase()}`;
        acc[shstMatchProp] = targetMapProp;
        return acc;
      }, {})
  );

// shst match mutates the keys, prepending 'pp_' and converting the orig key to lowercase
const normalizeShstMatchedFeatures = shstMatchedFeatures => {
  if (!Array.isArray(shstMatchedFeatures)) {
    return null;
  }

  const normalizedShstMatchedFeatures = _.uniqWith(
    shstMatchedFeatures,
    _.isEqual
  ).reduce((acc, shstMatchedFeature, i) => {
    const { properties } = shstMatchedFeature;

    const shstProps = _.omitBy(properties, (v, k) => /^pp_/.test(k));

    const targetMapProps = _(properties)
      .pickBy((v, k) => /^pp_targetmap/.test(k))
      .mapKeys((v, k) => targetMapPropertiesRestoreLookup[k])
      .value();

    acc.push({
      id: i,
      properties: { ...shstProps, ...targetMapProps },
      geometry: shstMatchedFeature.geometry
    });

    return acc;
  }, []);

  return normalizedShstMatchedFeatures;
};

const toposortShstMatchedFeatures = (
  shstMatchedFeatures,
  targetMapLinestringsAreDirected
) => {
  try {
    // Sometimes network edges are represented twice.
    //   From limited cursor look, happens with loops.
    // FIXME: This will remove one direction of traffic around a cul-de-sac
    //        A way to handle this might be to keep track of the removed segments,
    //          then put them back in the place of the stand in edge
    //          if the removed better fit the flow of travel.
    const filteredShstMatchedFeatures = _(shstMatchedFeatures)
      .uniqWith(_.isEqual)
      .sortBy('geometery.coordinates.length')
      .filter(
        (
          {
            properties: {
              shstFromIntersectionId: thisFromIntxn,
              shstToIntersectionId: thisToItnxn
            }
          },
          i,
          arr
        ) =>
          !arr
            .slice(i + 1)
            .some(
              ({
                properties: {
                  shstFromIntersectionId: otherFromIntxn,
                  shstToIntersectionId: otherToIntxn
                }
              }) =>
                thisFromIntxn === otherFromIntxn && thisToItnxn === otherToIntxn
            )
      )
      .value();

    if (filteredShstMatchedFeatures.length !== shstMatchedFeatures.length) {
      console.log(
        'FILTERED OUT',
        shstMatchedFeatures.length - filteredShstMatchedFeatures.length,
        'features'
      );
    }

    const sortedShstMatchedFeatures = targetMapLinestringsAreDirected
      ? createTopoSortedChain(filteredShstMatchedFeatures)
      : createTopoSortedChains(filteredShstMatchedFeatures);

    if (_.isNil(sortedShstMatchedFeatures)) {
      return null;
    }

    return targetMapLinestringsAreDirected
      ? [sortedShstMatchedFeatures]
      : sortedShstMatchedFeatures;
  } catch (err) {
    console.error(err);
    console.error(err.code);
    return null;
  }
};

class MatchedFeaturesProcessor {
  constructor(targetMapLinestringsAreDirected) {
    this.targetMapLinestringsAreDirected = targetMapLinestringsAreDirected;
  }

  // returns {
  //   <targetMapId>: {
  //     targetMapFeature,
  //     shstMatchedFeatures,
  //     shstMatchedFeaturesAreSorted
  //   }
  // }
  handleShstMatchedFeatures(targetMapFeatures, shstMatchedFeatures) {
    if (!Array.isArray(targetMapFeatures) || targetMapFeatures.length === 0) {
      return null;
    }

    updateTargetMapPropertiesRestoreLookup(targetMapFeatures);

    const associatedMatches = targetMapFeatures.reduce(
      (acc, targetMapFeature) => {
        const {
          properties: { targetMapId }
        } = targetMapFeature;

        acc[targetMapId] = {
          targetMapFeature,
          shstMatchedFeatures: null
        };

        return acc;
      },
      {}
    );

    const normalizedShstMatchedFeatures = normalizeShstMatchedFeatures(
      shstMatchedFeatures
    );

    if (normalizedShstMatchedFeatures === null) {
      return associatedMatches;
    }

    const normalizedShstMatchedFeaturesByTargetMapId = normalizedShstMatchedFeatures.reduce(
      (acc, shstMatchedFeature) => {
        const {
          properties: { targetMapId }
        } = shstMatchedFeature;

        acc[targetMapId] = acc[targetMapId] || [];
        acc[targetMapId].push(shstMatchedFeature);

        return acc;
      },
      {}
    );

    const targetMapIds = Object.keys(
      normalizedShstMatchedFeaturesByTargetMapId
    );

    for (let i = 0; i < targetMapIds.length; ++i) {
      const targetMapId = targetMapIds[i];
      // WARNING: Resets entry for associateMatches[targetMapId]
      associatedMatches[targetMapId] = {
        targetMapFeature: associatedMatches[targetMapId].targetMapFeature
      };

      const shstMatches =
        normalizedShstMatchedFeaturesByTargetMapId[targetMapId];

      if (shstMatches) {
        const sortedShstMatchedFeatures = toposortShstMatchedFeatures(
          shstMatches,
          this.targetMapLinestringsAreDirected
        );

        // This acts as a match quality test
        if (sortedShstMatchedFeatures) {
          const numReqLeadingZeros = `${targetMapIds.length - 1}`.length;

          associatedMatches[targetMapId].shstMatchedFeatures = [];
          associatedMatches[targetMapId].shstMatchedFeaturesAreSorted = true;

          for (let j = 0; j < sortedShstMatchedFeatures.length; ++j) {
            const chain = sortedShstMatchedFeatures[j];

            const matchedTargetMapMicroLevelBearing = getChainBearing(chain);

            const matchedTargetMapMicroProtoId = `${targetMapId}|${matchedTargetMapMicroLevelBearing}`;

            for (let k = 0; k < chain.length; ++k) {
              const shstMatchedFeature = chain[k];

              const matchedTargetMapMicroIdx = k;

              const idxKey = _.padStart(
                matchedTargetMapMicroIdx,
                numReqLeadingZeros,
                '0'
              );

              shstMatchedFeature.id = `${matchedTargetMapMicroProtoId}|${idxKey}`;

              Object.assign(shstMatchedFeature.properties, {
                matchedTargetMapMicroIdx,
                matchedTargetMapMicroLevelBearing,
                matchedTargetMapMicroProtoId
              });
            }

            associatedMatches[targetMapId].shstMatchedFeatures.push(...chain);
          }
        } else {
          const hexPadLen = Number(shstMatches.length - 1).toString(16).length;

          shstMatches.forEach((shstMatch, j) => {
            const idx = _.padStart(Number(j).toString(16), hexPadLen, '0');

            // eslint-disable-next-line no-param-reassign
            shstMatch.id = `${targetMapId}!${idx}`;
          });

          associatedMatches[targetMapId].shstMatchedFeatures = shstMatches;
          associatedMatches[targetMapId].shstMatchedFeaturesAreSorted = false;
        }
      }
    }

    return associatedMatches;
  }
}

module.exports = MatchedFeaturesProcessor;
