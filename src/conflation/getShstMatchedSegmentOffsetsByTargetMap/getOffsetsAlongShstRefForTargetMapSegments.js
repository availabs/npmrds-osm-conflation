/* eslint no-continue: 0, no-param-reassign: 0 */

const assert = require('assert');

const _ = require('lodash');
const turf = require('@turf/turf');
const { point } = require('@turf/helpers');

const removeTargetMapMatchSegmentsOverlaps = require('./removeTargetMapMatchSegmentsOverlaps');
const snapShstMatchNodes = require('./snapShstMatchNodes');

const { IN_KILOMETERS, SPLIT_BUFF_KM } = require('../constants');

const getRawOffsets = ({
  shstReferenceFeature,
  shstReferenceAuxProperties,
  matchedSegment
}) => {
  const { shstRefGeomLengthKm } = shstReferenceAuxProperties;
  const {
    geometry: { coordinates: matchLineStringCoords }
  } = matchedSegment;

  // Get the match LineString endpoints
  const matchStartPtCoords = point(_.first(matchLineStringCoords));
  const matchEndPtCoords = point(_.last(matchLineStringCoords));

  const {
    properties: { location: rawStartPtDistAlongShstRefKm }
  } = turf.nearestPointOnLine(
    shstReferenceFeature,
    matchStartPtCoords,
    IN_KILOMETERS
  );

  // To get the end point dist along, we need to account for loop shstRefs
  const matchedSegmentLength = turf.length(matchedSegment, IN_KILOMETERS);

  const sliceStartDist =
    rawStartPtDistAlongShstRefKm + matchedSegmentLength / 2;

  let restOfShstReferenceFeature;
  // FIXME: Figure out why this is happening.
  try {
    restOfShstReferenceFeature = turf.lineSliceAlong(
      shstReferenceFeature,
      sliceStartDist,
      Infinity,
      IN_KILOMETERS
    );
  } catch (err) {
    console.error('vvvvvvvvvvvv');
    console.error(
      JSON.stringify(
        { shstReferenceFeature, shstReferenceAuxProperties, matchedSegment },
        null,
        4
      )
    );
    console.error(err);
    console.error('^^^^^^^^^^^^');
    return null;
  }
  const {
    properties: { location: rawEndPtDistAlongRestOfShstRefKm }
  } = turf.nearestPointOnLine(
    restOfShstReferenceFeature,
    matchEndPtCoords,
    IN_KILOMETERS
  );

  const rawEndPtDistAlongShstRefKm =
    sliceStartDist + rawEndPtDistAlongRestOfShstRefKm;

  if (rawStartPtDistAlongShstRefKm > rawEndPtDistAlongShstRefKm) {
    // Ignore. Small segment.
    if (
      rawStartPtDistAlongShstRefKm - rawEndPtDistAlongShstRefKm <
      SPLIT_BUFF_KM
    ) {
      return null;
    }

    const m = JSON.stringify(
      {
        shstReferenceFeature,
        shstReferenceAuxProperties,
        matchedSegment,
        rawStartPtDistAlongShstRefKm,
        rawEndPtDistAlongShstRefKm
      },
      null,
      4
    );
    const msg = `INVARIANT BROKEN: rawStartPtDistAlongShstRefKm > rawEndPtDistAlongShstRefKm\n${m}`;
    throw new Error(msg);
  }

  // shstRef  s...........................e
  // match    |             s....e        |
  //          |             |    |        |
  //          |<---POFF---->|    |<-NOFF->|
  //          |<-startDist->|    |
  //          |<-----endDist---->|
  const POFF =
    // Try to snap to shstRef start point for simple error correction.
    rawStartPtDistAlongShstRefKm > SPLIT_BUFF_KM
      ? rawStartPtDistAlongShstRefKm
      : 0;

  const NOFF =
    // Try to snap to shstRef end point for simple error correction.
    shstRefGeomLengthKm - rawEndPtDistAlongShstRefKm
      ? shstRefGeomLengthKm - rawEndPtDistAlongShstRefKm
      : 0;

  const startDist = POFF;
  const endDist = shstRefGeomLengthKm - NOFF;

  const segLen = endDist - startDist;

  // Snapping POFF and NOFF can only increase the segLen.
  //   Therefore using SPLIT_BUFF_KM again to filter out
  //   segments that are too short does not compound
  //   the buffering effect. This filtering removes
  //   a common error of extending a matchSegment
  //   before or beyond an intersection at which,
  //   in the actual road network, it terminates.
  return segLen > SPLIT_BUFF_KM
    ? {
        POFF,
        NOFF,
        startDist,
        endDist
      }
    : null;
};

const getMatchedSegmentsLocationsAlongShstRef = ({
  shstReferenceFeature,
  shstReferenceAuxProperties,
  shstMatches,
  targetMap
}) => {
  const offsetsList = [];

  for (let i = 0; i < shstMatches.length; ++i) {
    const matchedSegment = shstMatches[i];
    const rawOffsets = getRawOffsets({
      shstReferenceFeature,
      shstReferenceAuxProperties,
      matchedSegment
    });

    if (rawOffsets !== null) {
      const {
        properties: { targetMapId, targetMapNetHrchyRank, targetMapIsPrimary }
      } = matchedSegment;

      // shstRef  s...........................e
      // match    |             s....e        |
      //          |             |    |        |
      //          |<---POFF---->|    |<-NOFF->|
      //          |<-startDist->|    |
      //          |<-----endDist---->|
      const snappedOffsets = snapShstMatchNodes({
        shstReferenceAuxProperties,
        rawOffsets
      });

      if (snappedOffsets !== null) {
        const { POFF, NOFF, startDist, endDist } = snappedOffsets;

        offsetsList.push({
          targetMap,
          targetMapId,
          targetMapNetHrchyRank,
          targetMapIsPrimary,
          POFF,
          NOFF,
          startDist,
          endDist
        });
      }
    }
  }

  if (!offsetsList.length) {
    return null;
  }

  const orderedNonOverlappingMatchedSegmentsOffsetsForShstRef = removeTargetMapMatchSegmentsOverlaps(
    offsetsList
  );

  assert(orderedNonOverlappingMatchedSegmentsOffsetsForShstRef !== null);

  return orderedNonOverlappingMatchedSegmentsOffsetsForShstRef;
};

module.exports = getMatchedSegmentsLocationsAlongShstRef;
