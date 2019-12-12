#!/usr/bin/env node

/* eslint no-continue: 0, no-param-reassign: 0 */

const _ = require('lodash');

const { OSM } = require('../constants');

const getOffsetsAlongShstRefForTargetMapSegments = require('./getOffsetsAlongShstRefForTargetMapSegments');
const getOffsetsAlongShstRefForUnderlyingOsmWays = require('./getOffsetsAlongShstRefForUnderlyingOsmWays');

const getShstMatchedSegmentOffsetsByTargetMap = ({
  shstReferenceFeature,
  shstReferenceAuxProperties,
  shstMatchesByTargetMap
}) => {
  const shstMatchedSegmentOffsetsByTargetMap = {};

  if (!_.isNil(shstMatchesByTargetMap)) {
    const targetMaps = Object.keys(shstMatchesByTargetMap);

    for (let i = 0; i < targetMaps.length; ++i) {
      const targetMap = targetMaps[i];

      const shstMatches = shstMatchesByTargetMap[targetMap].filter(
        ({ properties: { targetMapIsPrimary } }) => targetMapIsPrimary
      );

      const segmentOffsetsList = getOffsetsAlongShstRefForTargetMapSegments({
        shstReferenceFeature,
        shstReferenceAuxProperties,
        shstMatches,
        targetMap
      });

      if (segmentOffsetsList) {
        shstMatchedSegmentOffsetsByTargetMap[targetMap] = segmentOffsetsList;
      }
    }
  }

  shstMatchedSegmentOffsetsByTargetMap[
    OSM
  ] = getOffsetsAlongShstRefForUnderlyingOsmWays({
    shstReferenceAuxProperties,
    targetMap: OSM
  });

  return shstMatchedSegmentOffsetsByTargetMap;
};

module.exports = getShstMatchedSegmentOffsetsByTargetMap;
