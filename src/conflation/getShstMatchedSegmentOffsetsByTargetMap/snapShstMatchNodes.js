/* eslint no-continue: 0, no-param-reassign: 0 */

const { SPLIT_BUFF_KM, LENGTH_RATIO_THRESHOLD } = require('../constants');

// We try to snap the match segment's start and end nodes to existing shstRef nodes.
//    This is to minimize the mutations we make to the the source map.
//    If we cannot reuse an existing node for the match segment's start or end point,
//    we must creating a new node and insert it along the shstRef.
//    The more such mutations made,
//      the more our output map and the original OSM base map diverge
//      and the more complicated cross-map metadata becomes.
//
// 1) If match segment's start or end node is within SPLIT_BUFF_KM distance along the
//    shstRef of the of the shstRef's start or end node, we snap the match segment node
//    to the respective shStReference node.
//   .
//      This corrects a common error where target map inaccuracies at intersections
//      causes the SharedStreets matcher to incorrectly include portions of a
//      ShStReference on the other side of an intersection that in fact terminates
//      of the target map segment.
//
// 2) If we cannot reuse the shstRef's start and end nodes, where possible we snap
//    the matched segment's start and end nodes to existing shstRef internal nodes.
//
const snapShstMatchNodes = ({ shstReferenceAuxProperties, rawOffsets }) => {
  const {
    shstRefGeomLengthKm,
    shstRefGeomVerticesSeq
  } = shstReferenceAuxProperties;

  // FIXME: shstRefGeomVerticesSeq shouldn't be null. Throw an error here.
  if (rawOffsets === null || shstRefGeomVerticesSeq === null) {
    return null;
  }

  const {
    POFF: matchedSegmentRawPOFF,
    NOFF: matchedSegmentRawNOFF
  } = rawOffsets;

  let startNodeDistAlongShstRef;
  let startEndDistAlongShstRef;

  if (matchedSegmentRawPOFF <= SPLIT_BUFF_KM) {
    // Use the shstRef's start node as the matchSegment's start node.
    startNodeDistAlongShstRef = 0;
  } else {
    // Since we cannot reuse the shstRef's start node, we try to reuse one its other nodes
    //   to minimize the number of nodes that we create and insert into the output map.

    // Initialize the search's state variables.
    let reusedShstRefNodeIdx = null;
    let nearestShstNodeDist = Infinity;

    // Get the nearest node in the shstRef to this matchedSegment's start point
    for (let i = 1; i < shstRefGeomVerticesSeq.length; ++i) {
      // We get the pre-calculated positive offset of the current shstRef node
      const {
        properties: { POFF: curShstRefNodePOFF }
      } = shstRefGeomVerticesSeq[i];

      // What is the distance between the match segment's start point
      //   and the current shstRef node?
      const dist = Math.abs(matchedSegmentRawPOFF - curShstRefNodePOFF);

      // If the current shstRef node is nearer to the match start point
      //   than the previous nearest, update the search state variables.
      if (dist < nearestShstNodeDist) {
        // update the variable storing the shortest dist between the match's start point
        //   and an existing node of the shstRef.
        nearestShstNodeDist = dist;

        // Reuse the existing node if it is within 1/2 the buffer dist of the match's start point,
        if (dist <= SPLIT_BUFF_KM / 2) {
          reusedShstRefNodeIdx = i;
        }
      } else if (dist > nearestShstNodeDist) {
        // Because the distances will monotonically decrease until we hit the minimum,
        //   then monitonically increase, we know that we have already seen the nearest node.
        break;
      }
    }

    // The distance this target map segment's startpoint is along shstReferenceFeature
    startNodeDistAlongShstRef =
      reusedShstRefNodeIdx !== null
        ? // We were able to reuse a node.
          shstRefGeomVerticesSeq[reusedShstRefNodeIdx].properties.POFF
        : // We must insert a new node into the shstRef.
          matchedSegmentRawPOFF;
  }

  // Same logic as above for snapping the matched segment's start point to an existing
  //   shstRef node, except now we are working with the matched segment's end point
  //   and we search the shstRef nodes in reverse order (from the end towards the start).
  if (matchedSegmentRawNOFF <= SPLIT_BUFF_KM) {
    // Use the shstRef's end node as the matchSegment's start node.
    startEndDistAlongShstRef = shstRefGeomLengthKm;
  } else {
    let reusedShstRefNodeIdx = null;
    let nearestShstNodeDist = Infinity;

    // FIXME: It'd be conceptually cleaner to iterate in reverse order.
    for (let i = shstRefGeomVerticesSeq.length - 1; i > 0; --i) {
      const {
        properties: { NOFF: shstRefNodeNOFF }
      } = shstRefGeomVerticesSeq[i];

      const dist = Math.abs(matchedSegmentRawNOFF - shstRefNodeNOFF);

      if (dist < nearestShstNodeDist) {
        nearestShstNodeDist = dist;

        if (dist <= SPLIT_BUFF_KM / 2) {
          reusedShstRefNodeIdx = i;
        }
      } else {
        // Because the distances will monotonically decrease until we hit the minimum,
        //   then monitonically increase, we know that we have already seen the nearest node.
        break;
      }
    }

    // Distance along shstReferenceFeature to this target map segment's end point
    // NOTE: We change
    //    from distance between matched segment's end point and the shstRef's end point
    //    to distance between matched segment's end point and the shstRef's start point
    startEndDistAlongShstRef =
      reusedShstRefNodeIdx !== null
        ? shstRefGeomVerticesSeq[reusedShstRefNodeIdx].properties.POFF
        : shstRefGeomLengthKm - matchedSegmentRawNOFF;
  }

  // The matchedSegment's length after (possibly) snapping the start and end points.
  const segLen = startEndDistAlongShstRef - startNodeDistAlongShstRef;

  if (
    // If the snapped matchSegment is shorter than the SPLIT_BUFF
    segLen < SPLIT_BUFF_KM &&
    // and we are not dealing with a case where the shstRef is itself
    //   very short and the matchSegment covers a large portion it
    segLen / shstRefGeomLengthKm < LENGTH_RATIO_THRESHOLD
  ) {
    // disregard the segment
    return null;
  }

  // Return the matchedSegment's (possibly) snapped startpoint distance along and
  //   end point distance from the shstRef's end point.
  //
  // shstRef  s...........................e
  // match    |             s....e        |
  //          |             |    |        |
  //          |<---POFF---->|    |<-NOFF->|
  //          |<-startDist->|    |
  //          |<-----endDist---->|
  return {
    POFF: matchedSegmentRawPOFF,
    NOFF: matchedSegmentRawNOFF,
    startDist: matchedSegmentRawPOFF,
    endDist: startEndDistAlongShstRef
  };
};

module.exports = snapShstMatchNodes;
