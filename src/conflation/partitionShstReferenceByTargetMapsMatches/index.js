#!/usr/bin/env node

/* eslint no-continue: 0, prefer-destructuring: 0, no-labels: 0, no-restricted-syntax: 0, no-param-reassign: 0 */
const _ = require('lodash');
const turf = require('@turf/turf');
const turfHelpers = require('@turf/helpers');

const validateShstReferenceSplitting = require('./validateShstReferenceSplitting');

const { OSM, IN_KILOMETERS } = require('../constants');

const partitionShstReferenceByTargetMapsMatches = ({
  shstReferenceFeature,
  shstReferenceAuxProperties,
  shstMatchedSegmentOffsetsByTargetMap
}) => {
  const {
    osmWaySections,
    shstRefGeomLengthKm,
    shstRefGeomVerticesSeq
  } = shstReferenceAuxProperties;

  // Nothing to do here.
  if (shstRefGeomVerticesSeq === null) {
    return null;
  }

  // The matchedSegment offsets across all target maps
  const allMatchedSegmentsOffsets = _(shstMatchedSegmentOffsetsByTargetMap)
    .flatMap()
    .filter()
    .value();

  // Nothing to do here.
  if (!allMatchedSegmentsOffsets.length) {
    return null;
  }
  // All unique matched segment start/end node offsets along the shstRef in sorted order.
  const orderedSplitterOffsetsList = _(
    Array.prototype.concat(
      [0, shstRefGeomLengthKm],
      allMatchedSegmentsOffsets.map(({ startDist, endDist }) => [
        startDist,
        endDist
      ])
    )
  )
    .flatten()
    .filter(_.negate(_.isNil))
    .sortBy(_.toNumber)
    .sortedUniq()
    .value();

  // This is the list
  const splitGeomVertices = _.cloneDeep(shstRefGeomVerticesSeq);
  const shstReferencePartitions = [];

  const baseSegmentProperties = _.pick(shstReferenceFeature.properties, [
    'geometryId',
    'referenceId',
    'fromIntersectionId',
    'toIntersectionId',
    'reversed',
    'state',
    'shstReferenceMicroLevelDirectionOfTravel'
  ]);

  for (let i = 1; i < orderedSplitterOffsetsList.length; ++i) {
    const startDist = orderedSplitterOffsetsList[i - 1];
    const endDist = orderedSplitterOffsetsList[i];

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
      totalSegments: orderedSplitterOffsetsList.length - 1,
      segmentIndex: i,
      startDist,
      endDist
    });

    const segment = turfHelpers.lineString(
      segmentCoordinates,
      segmentProperties
    );

    shstReferencePartitions.push(segment);
  }

  // add targetMapMetadata to the conflationMap micro-level features
  for (let i = 0; i < allMatchedSegmentsOffsets.length; ++i) {
    const matchedSegmentOffsetsObj = allMatchedSegmentsOffsets[i];

    const {
      startDist: tmsStartDist,
      endDist: tmsEndDist,
      targetMap
    } = matchedSegmentOffsetsObj;

    const tmsStart = _.round(tmsStartDist, 6);
    const tmsEnd = _.round(tmsEndDist, 6);

    for (let j = 0; j < shstReferencePartitions.length; ++j) {
      const segment = shstReferencePartitions[j];
      const {
        properties: { startDist, endDist }
      } = segment;

      // If targetMapSeg overlaps shstRefSubSegment, assign the targetMapId
      //   to the segment's respective targetMap property.
      if (
        // segment.properties[target_map] !== target_map_id &&
        // targetMapSeg begins before or at shstRefSubSegment beginning
        tmsStart <= startDist &&
        // targetMapSeg begins before shstRefSubSegment ending
        tmsStart < endDist &&
        // targetMapSeg ends after shstRefSubSegment begins
        tmsEnd > startDist
      ) {
        if (segment.properties[targetMap]) {
          // FIXME: Throw this
          console.error(
            'INVARIANT BROKEN. More than one target_map segment per source map segment.'
          );
        }

        const targetMapProperties = _.pickBy(matchedSegmentOffsetsObj, (v, k) =>
          /^targetMap*/.test(k)
        );
        const matchedTargetMapProperties = _.pickBy(
          matchedSegmentOffsetsObj,
          (v, k) => /^matchedTargetMap*/.test(k)
        );

        const targetMapMetadata = {
          ...targetMapProperties,
          ...matchedTargetMapProperties
        };

        // TODO: Make this a sub-object with multiple fields.
        segment.properties[targetMap] = targetMapMetadata;
      }
    }
  }

  // add osmMetadata properties
  const osmWaySectionsByWayIds = osmWaySections.reduce((acc, waySection) => {
    const { wayId } = waySection;
    acc[wayId] = waySection;
    return acc;
  }, {});

  for (let i = 0; i < shstReferencePartitions.length; ++i) {
    const segment = shstReferencePartitions[i];

    const {
      properties: { [OSM]: wayId }
    } = segment;

    if (_.isNil(wayId)) {
      // FIXME: Throw here
      console.error('ERROR: wayId === null');
    }

    const waySection = osmWaySectionsByWayIds[wayId] || null;

    Object.assign(
      segment.properties.osmMetadata,
      _.omit(waySection, 'nodeIds')
    );
  }

  validateShstReferenceSplitting({
    shstReferenceAuxProperties,
    shstReferencePartitions
  });

  return shstReferencePartitions;
};

module.exports = partitionShstReferenceByTargetMapsMatches;
