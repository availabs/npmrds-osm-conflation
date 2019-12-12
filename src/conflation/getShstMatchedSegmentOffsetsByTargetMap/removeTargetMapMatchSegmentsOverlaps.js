/* eslint no-continue: 0, */

const assert = require('assert');
const _ = require('lodash');

const { SPLIT_BUFF_KM } = require('./../constants');

const NO_OVERLAP = 'NO_OVERLAP';
const LOWER_RANKED_COVERED_BY_HIGHER_RANKED =
  'LOWER_RANKED_COVERED_BY_HIGHER_RANKED';
const LOWER_RANKED_TRAILINGLY_OVERLAPS_HIGHER_RANKED =
  'LOWER_RANKED_TRAILINGLY_OVERLAPS_HIGHER_RANKED';
const LOWER_RANKED_LEADINGLY_OVERLAPS_HIGHER_RANKED =
  'LOWER_RANKED_LEADINGLY_OVERLAPS_HIGHER_RANKED';
const LOWER_RANKED_COVERS_HIGHER_RANKED = 'LOWER_RANKED_COVERS_HIGHER_RANKED';
const UNKNOWN = 'UNKNOWN';

const classifySpatialRelationship = ({ lowerRanked, higherRanked }) => {
  // The following logic assumes positive length segments.
  // Zero-length and negative-length segments MUST by filtered out before this step.
  assert(lowerRanked.startDist < lowerRanked.endDist);
  assert(higherRanked.startDist < higherRanked.endDist);

  // Legend:
  //   o : start node or end node
  //   . : possibly existing portion
  //   - : necessarily existing portion
  if (
    // higherRanked: o-----o
    // lowerRanked:        ...o-----o
    lowerRanked.startDist >= higherRanked.endDist ||
    // higherRanked:          o-----o
    // lowerRanked:  o-----o...
    lowerRanked.endDist <= higherRanked.startDist
  ) {
    return NO_OVERLAP;
  }

  if (
    // higherRanked: o-------o
    // lowerRanked:  ..o---o..
    lowerRanked.startDist >= higherRanked.startDist &&
    lowerRanked.endDist <= higherRanked.endDist
  ) {
    return LOWER_RANKED_COVERED_BY_HIGHER_RANKED;
  }

  if (
    // higherRanked:  o-----o
    // lowerRanked:   ...o..---o
    lowerRanked.startDist >= higherRanked.startDist &&
    lowerRanked.startDist < higherRanked.endDist &&
    lowerRanked.endDist > higherRanked.endDist
  ) {
    return LOWER_RANKED_TRAILINGLY_OVERLAPS_HIGHER_RANKED;
  }

  if (
    // higherRanked:    o-----o
    // lowerRanked:  o---..o...
    lowerRanked.startDist < higherRanked.startDist &&
    lowerRanked.endDist > higherRanked.startDist &&
    lowerRanked.endDist <= higherRanked.endDist
  ) {
    return LOWER_RANKED_LEADINGLY_OVERLAPS_HIGHER_RANKED;
  }

  if (
    // higherRanked:   o---o
    // lowerRanked:  o-------o
    lowerRanked.startDist < higherRanked.startDist &&
    lowerRanked.endDist > higherRanked.endDist
  ) {
    return LOWER_RANKED_COVERS_HIGHER_RANKED;
  }

  return UNKNOWN;
};

const finalOffetsContainsOverlaps = finalOffsets => {
  if (finalOffsets.length) {
    let { endDist: prevEndDist } = _.first(finalOffsets);
    for (let i = 1; i < finalOffsets.length; ++i) {
      const { startDist, endDist } = _.first(finalOffsets);

      if (startDist > prevEndDist) {
        console.error(
          'OVERLAP DETECTED. startDist:',
          startDist,
          ', prevEndDist:',
          prevEndDist
        );
        return true;
      }

      prevEndDist = endDist;
    }
  }

  return false;
};

const removeTargetMapMatchSegmentsOverlaps = (
  targetMapMatchedSegementOffsetsForShstRef,
  threshold = SPLIT_BUFF_KM
) => {
  const networkRankedToAddOffsets = _.sortBy(
    _.cloneDeep(targetMapMatchedSegementOffsetsForShstRef),
    ['fsytem', ({ startDist, endDist }) => startDist - endDist]
  );

  const nonOverlapping = [networkRankedToAddOffsets[0]];

  // NOTE: networkRankedToAddOffsets array length may increase within loop
  //       because of the LOWER_RANKED_COVERS_HIGHER_RANKED case. In this case, an inner
  //       portion of the lowerRanked match segment is remove, leaving
  //       two portions at the segment start and end.
  //
  //       E.G.
  //                       higherRanked:   o---o
  //                       lowerRanked:  o-------o
  //         Yields
  //                       higherRanked:   o---o
  //                       lowerRanked:  o-o   o-o
  //
  // CONSIDER: We should probably prefer match segments that have not been split,
  //           regardless of relative network hierarchy rank.
  //
  //       E.G.
  //                       higherRanked:   o---o
  //                       lowerRanked:  o-------o
  //                       lowestRanked  o-o   o-o
  //          Should yield
  //                       higherRanked:   o---o
  //                       lowerRanked:
  //                       lowestRanked  o-o   o-o
  //
  //            This logic would be a bit complicated. Not enough time to tackle now.
  for (
    let toAddIdx = 1;
    // NOTE: The length of the networkRankedToAddOffsets array may increase within loop.
    //       See above explanation.
    toAddIdx < networkRankedToAddOffsets.length;
    ++toAddIdx
  ) {
    // Because networkRankedToAddOffsets is sorted by rank,
    //   lowerRanked will never mutate a member of nonOverlapping.
    //   However, nonOverlapping elements may mutate lowerRanked.
    const lowerRanked = networkRankedToAddOffsets[toAddIdx];

    // Since we are pushing to the end of the nonOverlapping list from within
    //   the following loop, we want to stop at the current last element.
    //   All elements after the current last were added as a result of
    //   the effects of currently existing nonOverlapping list members on lowerRanked.
    const innerLoopStopIdx = nonOverlapping.length;

    for (
      let higherRankedIdx = 0;
      higherRankedIdx < innerLoopStopIdx;
      ++higherRankedIdx
    ) {
      const higherRanked = nonOverlapping[higherRankedIdx];

      const spatialRelationship = classifySpatialRelationship({
        higherRanked,
        lowerRanked
      });

      switch (spatialRelationship) {
        case NO_OVERLAP: {
          // No overlap, therefore not need to mutate the lowerRanked.
          break;
        }

        case LOWER_RANKED_COVERED_BY_HIGHER_RANKED: {
          // Set the lowerRanked segment's length to zero and filter out below.
          lowerRanked.startDist = 0;
          lowerRanked.endDist = 0;
          break;
        }

        case LOWER_RANKED_TRAILINGLY_OVERLAPS_HIGHER_RANKED: {
          // Trim off the portion of the lowerRanked segment that
          //   preceeds the higherRanked segment's end point
          lowerRanked.startDist = higherRanked.endDist;
          break;
        }

        case LOWER_RANKED_LEADINGLY_OVERLAPS_HIGHER_RANKED: {
          // Trim off the portion of the lowerRanked segment that
          //   follows the higherRanked segment's start point
          lowerRanked.endDist = higherRanked.startDist;
          break;
        }

        case LOWER_RANKED_COVERS_HIGHER_RANKED: {
          // make a clone of lowerRanked
          const toAddClone = _.cloneDeep(lowerRanked);

          lowerRanked.endDist = higherRanked.startDist;
          toAddClone.startDist = higherRanked.endDist;

          if (toAddClone.endDist - toAddClone.startDist > SPLIT_BUFF_KM / 2) {
            networkRankedToAddOffsets.splice(toAddIdx + 1, 0, toAddClone);
          }
          break;
        }

        default: {
          // The above should cover all cases. If we got here, there is a logical error above.
          throw new Error(
            'ERROR: There is a logical flaw in the spatial relationship classification logic.'
          );
        }
      }

      const lowerRankedLen = lowerRanked.endDist - lowerRanked.startDist;

      if (lowerRankedLen < threshold) {
        break;
      }
    } // end innner loop.

    const newLowerRankedSegmentLength =
      lowerRanked.endDist - lowerRanked.startDist;

    if (
      newLowerRankedSegmentLength > 0 &&
      newLowerRankedSegmentLength >= threshold
    ) {
      nonOverlapping.push(lowerRanked);
    }
  }

  const orderedNonOverlappingMatchedSegmentsOffsetsForShstReference = nonOverlapping.sort(
    (a, b) => a.startDist - b.startDist
  );

  if (
    finalOffetsContainsOverlaps(
      orderedNonOverlappingMatchedSegmentsOffsetsForShstReference
    )
  ) {
    // FIXME: Throw here
    console.error('ERROR: Overlaps in match segments.');
    // console.error(
    // JSON.stringify(
    // { orderedNonOverlappingMatchedSegmentsOffsetsForShstReference },
    // null,
    // 4
    // )
    // );
  }

  return orderedNonOverlappingMatchedSegmentsOffsetsForShstReference;
};

module.exports = removeTargetMapMatchSegmentsOverlaps;
