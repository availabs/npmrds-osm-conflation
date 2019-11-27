#!/usr/bin/env node

/* eslint no-continue: 0, prefer-destructuring: 0, no-labels: 0, no-restricted-syntax: 0, no-param-reassign: 0 */
const _ = require('lodash');
const turf = require('@turf/turf');
const turfHelpers = require('@turf/helpers');

const { getShstReferenceId } = require('./utils');

const { IN_KILOMETERS, OSM, SPLIT_BUFF_KM } = require('./constants');

const getMatchedSegmentPairings = (
  shstReferenceFeature,
  matchedSegmentOffsets
) => {
  const dataSources = Object.keys(matchedSegmentOffsets);

  for (let i = 0; i < dataSources.length; ++i) {
    const dataSource = dataSources[i];

    const years = Object.keys(matchedSegmentOffsets[dataSource]);
    for (let j = 0; j < years.length; ++j) {
      const year = years[j];

      const offsetList = matchedSegmentOffsets[dataSource][year];
    }
  }
};

const splitForMatchedSegments = shstReferenceFeature => {
  const shstReferenceId = getShstReferenceId(shstReferenceFeature);
  const shstRefGeomLengthKm = turf.length(shstReferenceFeature, IN_KILOMETERS);

  const {
    properties: {
      osmMetadata: { waySections: osmWaySections },
      osmNodeIdsSeq,
      shstRefGeomVerticesSeq,
      segmentOffsets
    }
  } = shstReferenceFeature;

  if (!(Array.isArray(osmWaySections) && osmWaySections.length)) {
    console.warn(
      'WARNING: no osmWaySections for shstReference',
      shstReferenceId
    );
  }

  if (shstRefGeomVerticesSeq === null) {
    return null;
  }

  // Split the shstRef on OSM Ways as well.
  if (osmNodeIdsSeq && osmNodeIdsSeq.length === shstRefGeomVerticesSeq.length) {
    // Need to iterate over the osmNodeIdsSeq while
    //   handling the nodes that connect waySections
    let vertexIdx = 0;

    cleanedSegmentOffsetsByTargetMap[OSM] = osmWaySections.reduce(
      (acc, waySection) => {
        const { wayId, nodeIds, fsystem } = waySection;

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

        const {
          properties: { POFF: startDist }
        } = startVertex;
        const {
          properties: { POFF: endDist }
        } = endVertex;

        acc.push({
          target_map: OSM,
          target_map_id: wayId,
          fsystem,
          startDist,
          endDist
        });

        return acc;
      },
      []
    );
  } else {
    console.error(
      `INVARIANT BROKEN: Number of OSM nodes !== Number of shstGeom Vertices: ${shstReferenceId}`
    );
    return null;
  }

  // Remove overlapping target map segments
  // WARNING: Object mutations
  const nonOverlappingSegmentOffsets = Object.keys(
    cleanedSegmentOffsetsByTargetMap
  ).reduce((acc, target_map) => {
    const networkRankedToAddOffsets = _.uniqBy(
      _.sortBy(_.cloneDeep(cleanedSegmentOffsetsByTargetMap[target_map]), [
        'fsytem',
        'target_map_id'
      ])
    );

    const nonOverlapping = [networkRankedToAddOffsets[0]];

    for (
      let toAddIdx = 1;
      // NOTE: networkRankedToAddOffsets array length may increase within loop
      toAddIdx < networkRankedToAddOffsets.length;
      ++toAddIdx
    ) {
      // Because networkRankedToAddOffsets is sorted by rank,
      //   toAdd will never mutate a member of nonOverlapping.
      //   However, nonOverlapping elements may mutate toAdd.
      const toAdd = networkRankedToAddOffsets[toAddIdx];

      // Since we are pushing to the end of the nonOverlapping list from within
      //   the following loop, we want to stop at the current last element.
      //   All elements after the current last were added as a result of
      //   the effects of currently existing nonOverlapping list members on toAdd.
      const innerLoopStopIdx = nonOverlapping.length;

      for (
        let alreadyAddedIdx = 0;
        alreadyAddedIdx < innerLoopStopIdx;
        ++alreadyAddedIdx
      ) {
        const alreadyAdded = nonOverlapping[alreadyAddedIdx];

        // No overlap -> No need to trim toAdd.
        if (
          toAdd.startDist >= alreadyAdded.endDist ||
          toAdd.endDist <= alreadyAdded.startDist
        ) {
          continue;
        }

        if (
          // toAdd      :    o-----o
          // alreadyAdded: o-----o
          toAdd.startDist >= alreadyAdded.startDist &&
          toAdd.startDist <= alreadyAdded.endDist
        ) {
          toAdd.startDist = alreadyAdded.endDist;
        }

        if (
          // toAdd      : o-----o
          // alreadyAdded:    o-----o
          toAdd.endDist >= alreadyAdded.startDist &&
          toAdd.endDist <= alreadyAdded.endDist
        ) {
          toAdd.endDist = alreadyAdded.startDist;
        }

        // Split toAdd case
        if (
          // toAdd      :  o-------o
          // alreadyAdded:   o---o
          toAdd.endDist - toAdd.startDist > 0 &&
          toAdd.startDist <= alreadyAdded.startDist &&
          toAdd.endDist >= alreadyAdded.endDist
        ) {
          // make a clone of toAdd
          const toAddClone = _.cloneDeep(toAdd);

          toAdd.endDist = alreadyAdded.startDist;
          toAddClone.startDist = alreadyAdded.endDist;

          // Change arithmetic based to simpler inequality
          if (toAddClone.endDist - toAddClone.startDist > 0) {
            networkRankedToAddOffsets.splice(toAddIdx + 1, 0, toAddClone);
          }
        }

        if (
          // toAdd      :   o---o
          // alreadyAdded: o-------o
          toAdd.startDist >= alreadyAdded.startDist &&
          toAdd.endDist <= alreadyAdded.endDist
        ) {
          toAdd.startDist = 0;
          toAdd.endDist = 0;
        }
      } // end innner loop.

      const toAddLen = toAdd.endDist - toAdd.startDist;
      if ((target_map === OSM && toAddLen > 0) || toAddLen >= SPLIT_BUFF_KM) {
        nonOverlapping.push(toAdd);
      }
    }

    // remove the nulled out segments
    acc[target_map] = nonOverlapping.filter(s => s);

    return acc;
  }, {});

  const processedOffsetsList = _.flatten(
    _.values(nonOverlappingSegmentOffsets)
  );

  if (!processedOffsetsList.length) {
    return null;
  }

  const splitterOffsets = _(
    Array.prototype.concat(
      [0, shstRefGeomLengthKm],
      processedOffsetsList.map(({ startDist, endDist }) => [startDist, endDist])
    )
  )
    .flatten()
    .filter(v => v !== null)
    .sortBy(_.toNumber)
    .sortedUniq()
    .value();

  const splitGeomVertices = _.cloneDeep(shstRefGeomVerticesSeq);
  const segmentLineStrings = [];
  const baseSegmentProperties = _.pick(shstReferenceFeature.properties, [
    'geometryId',
    'referenceId',
    'fromIntersectionId',
    'toIntersectionId',
    'reversed',
    'state'
  ]);

  for (let i = 1; i < splitterOffsets.length; ++i) {
    const startDist = splitterOffsets[i - 1];
    const endDist = splitterOffsets[i];

    // NOTE: for the first segment, startDistance is zero,
    //       which is guaranteed to have an OSM Node and ShStRefGeom vertex.
    //       Only need to concern ourselves with creating endDist nodes/vertices.
    let endVertex = splitGeomVertices.find(
      ({ properties: { POFF } }) => POFF === endDist
    );

    // Wasn't able to reuse an existing node/vertex. Need to create one.
    if (!endVertex) {
      endVertex = turf.along(shstReferenceFeature, endDist, IN_KILOMETERS);

      // Indicates a synthetic splitter node. Not in original geom.
      endVertex.properties.osmNodeId = null;
      endVertex.properties.POFF = endDist;
      endVertex.properties.NOFF = shstRefGeomLengthKm - endDist;

      const insertIdx = splitGeomVertices.findIndex(
        ({ properties: { POFF } }) => POFF > endDist
      );

      // NOTE: because splitter offsets is an ordered set,
      //   the next segment will reuse this new vertex as the startVertex
      splitGeomVertices.splice(insertIdx, 0, endVertex);
    }

    const nodeIds = [];
    const segmentCoordinates = [];

    for (let j = 0; j < splitGeomVertices.length; ++j) {
      const v = splitGeomVertices[j];
      const {
        properties: { osmNodeId, POFF },
        geometry: { coordinates: vertexCoordinates }
      } = v;

      if (POFF < startDist) {
        continue;
      }

      if (POFF > endDist) {
        break;
      }

      nodeIds.push(osmNodeId);
      segmentCoordinates.push(vertexCoordinates);
    }

    const segmentProperties = Object.assign({}, baseSegmentProperties, {
      osmMetadata: {
        // NOTE: Rest of waySection metadata filled in when OSM WayId assigned to the segment.
        waySection: {
          nodeIds
        }
      },
      totalSegments: splitterOffsets.length - 1,
      segmentIndex: i,
      startDist,
      endDist
    });

    const segment = turfHelpers.lineString(
      segmentCoordinates,
      segmentProperties
    );

    segmentLineStrings.push(segment);
  }

  // Map targetMap IDs to the sourceMap segments
  for (let i = 0; i < processedOffsetsList.length; ++i) {
    const {
      startDist: tmsStartDist,
      endDist: tmsEndDist,
      target_map,
      target_map_id
    } = processedOffsetsList[i];

    for (let j = 0; j < segmentLineStrings.length; ++j) {
      const segment = segmentLineStrings[j];
      const {
        properties: { startDist, endDist }
      } = segment;

      // If targetMapSeg overlaps sourceMapSeg, assign the targetMapId
      //   to the segment's respective targetMap property.
      if (
        // segment.properties[target_map] !== target_map_id &&
        // targetMapSeg begins before or at sourceMapSeg beginning
        tmsStartDist <= startDist &&
        // targetMapSeg begins before sourceMapSeg ending
        tmsStartDist < endDist &&
        // targetMapSeg ends after sourceMapSeg begins
        tmsEndDist > startDist
      ) {
        if (segment.properties[target_map]) {
          throw new Error(
            'INVARIANT BROKEN. More than one target_map segment per source map segment.'
          );
        }
        segment.properties[target_map] = target_map_id;
      }
    }
  }

  // add osmMetadata properties
  const osmWaySectionsByWayIds = osmWaySections.reduce((acc, waySection) => {
    const { wayId } = waySection;
    acc[wayId] = waySection;
    return acc;
  }, {});

  for (let i = 0; i < segmentLineStrings.length; ++i) {
    const segment = segmentLineStrings[i];
    const {
      properties: { OSM: wayId = null }
    } = segment;

    if (wayId === null) {
      console.error(
        JSON.stringify(
          {
            // segmentLineStrings,
            osmWaySections,
            cleanedSegmentOffsetsByTargetMap,
            nonOverlappingSegmentOffsets,
            shstRefGeomLengthKm,
            shstReferenceId
          },
          null,
          4
        )
      );

      throw new Error(
        'INVARIANT BROKEN: shstRef segment without a mapped OSM WayID'
      );
    }

    const waySection = osmWaySectionsByWayIds[wayId];

    Object.assign(
      segment.properties.osmMetadata,
      _.omit(waySection, 'nodeIds')
    );
  }

  // Validate the osmMetadata nodeIds.
  //   Downsteam processing depends on their connectedness and completeness.
  const outputNodeIdChains = _(segmentLineStrings)
    .sortBy(['segmentIndex'])
    .map('properties.osmMetadata.waySection.nodeIds')
    .value();

  // INVARIANT: Chains are connected
  if (outputNodeIdChains.length > 1) {
    for (let i = 1; i < outputNodeIdChains.length; ++i) {
      const prev = outputNodeIdChains[i - 1];
      const cur = outputNodeIdChains[i];

      if (_.last(prev) !== _.first(cur)) {
        throw new Error(
          'ERROR: INVARIANT BROKEN. Split segments nodeId chains are not connected.'
        );
      }
    }
  }

  const outputNodeIdsSeq = _.flatten(outputNodeIdChains).reduce(
    (acc, nodeId) => {
      if (nodeId !== null && nodeId !== _.last(acc)) {
        acc.push(nodeId);
      }
      return acc;
    },
    []
  );

  if (!_.isEqual(osmNodeIdsSeq, outputNodeIdsSeq)) {
    console.error('*'.repeat(40));
    console.error(
      JSON.stringify(
        {
          'in-out': _.difference(osmNodeIdsSeq, outputNodeIdsSeq),
          'out-in': _.difference(outputNodeIdsSeq, osmNodeIdsSeq)
        },
        null,
        4
      )
    );
    console.error(osmNodeIdsSeq.length, outputNodeIdsSeq.length);
    console.error(
      JSON.stringify(
        { inputNodeIdsSeq: osmNodeIdsSeq, outputNodeIdsSeq },
        null,
        4
      )
    );
    throw new Error(
      'ERROR: INVARIANT BROKEN. Output osmNodeIdsSeq !== Input osmNodeIdsSeq.'
    );
  }

  return segmentLineStrings;
};
