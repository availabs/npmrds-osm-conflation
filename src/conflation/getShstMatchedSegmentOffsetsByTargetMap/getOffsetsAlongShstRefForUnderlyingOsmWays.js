const assert = require('assert');

const _ = require('lodash');

const removeTargetMapMatchSegmentsOverlaps = require('./removeTargetMapMatchSegmentsOverlaps');

const { OSM, shstOsmWayRoadClassRankings } = require('../constants');

const getOffsetsAlongShstRefForUnderlyingOsmWays = ({
  shstReferenceAuxProperties
}) => {
  const {
    shstReferenceId,
    osmWaySections,
    osmNodeIdsSeq,
    shstRefGeomVerticesSeq
  } = shstReferenceAuxProperties;

  if (!(osmWaySections && osmNodeIdsSeq && shstRefGeomVerticesSeq)) {
    console.error(
      'getOffsetsAlongShstRefForUnderlyingOsmWays requires osmWaySections && osmNodeIdsSeq && shstRefGeomVerticesSeq'
    );
    return null;
  }

  // If this condition does not hold, the logic below is invalid.
  if (osmNodeIdsSeq.length !== shstRefGeomVerticesSeq.length) {
    console.error(
      `INVARIANT BROKEN: Number of OSM nodes !== Number of shstGeom Vertices: ${shstReferenceId}`
    );
    console.error(
      JSON.stringify({ osmNodeIdsSeq, shstRefGeomVerticesSeq }, null, 4)
    );
    return null;
  }

  // Need to iterate over the osmNodeIdsSeq while handling the nodes that connect waySections
  let vertexIdx = 0;

  const offsetsList = osmWaySections.reduce((acc, waySection) => {
    const { wayId, nodeIds, roadClass } = waySection;

    const targetMapNetHrchyRank = Number.isFinite(
      shstOsmWayRoadClassRankings[roadClass]
    )
      ? shstOsmWayRoadClassRankings[roadClass]
      : shstOsmWayRoadClassRankings.Other;

    const startNodeId = _.first(nodeIds);
    const endNodeId = _.last(nodeIds);

    let startVertex;
    let endVertex;

    while (vertexIdx < shstRefGeomVerticesSeq.length) {
      const v = shstRefGeomVerticesSeq[vertexIdx++];
      if (v.properties.osmNodeId === startNodeId) {
        startVertex = v;
        break;
      }
    }

    if (!startVertex) {
      console.error(
        JSON.stringify({ nodeIds, shstRefGeomVerticesSeq }, null, 4)
      );
      throw new Error('Could not find osmWaySections startVertex');
    }

    for (; vertexIdx < shstRefGeomVerticesSeq.length; ++vertexIdx) {
      const v = shstRefGeomVerticesSeq[vertexIdx];
      if (v.properties.osmNodeId === endNodeId) {
        endVertex = v;
        break;
      }
    }

    if (!endVertex) {
      console.error(
        JSON.stringify({ nodeIds, shstRefGeomVerticesSeq }, null, 4)
      );
      throw new Error('Could not find osmWaySections endVertex');
    }

    // NOTE: For target maps matched segments, POFF and NOFF represent
    //       the Positive and Negative Offsets for the match segment.
    //
    //         shstRef  s...........................e
    //         match    |             s....e        |
    //                  |             |    |        |
    //                  |<---POFF---->|    |<-NOFF->|
    //                  |<-startDist->|    |
    //                  |<-----endDist---->|
    //
    //       For target maps matched segments, startDist and endDist represent
    //       the distance along the shstRef for the the matched segment's
    //       start and end points after potentially SNAPPING those nodes to
    //       existing shstRef nodes. For these OSM ways, there is no need for snapping.
    const {
      properties: { POFF: startDist }
    } = startVertex;

    const {
      properties: { POFF: endDist, NOFF }
    } = endVertex;

    acc.push({
      targetMap: OSM,
      targetMapId: wayId,
      targetMapNetHrchyRank,
      targetMapIsPrimary: true,
      POFF: startDist,
      NOFF,
      startDist,
      endDist
    });

    return acc;
  }, []);

  const orderedNonOverlappingMatchedSegmentsOffsetsForShstRef = removeTargetMapMatchSegmentsOverlaps(
    offsetsList,
    0
  );

  assert(orderedNonOverlappingMatchedSegmentsOffsetsForShstRef !== null);

  return orderedNonOverlappingMatchedSegmentsOffsetsForShstRef;
};

module.exports = getOffsetsAlongShstRefForUnderlyingOsmWays;
