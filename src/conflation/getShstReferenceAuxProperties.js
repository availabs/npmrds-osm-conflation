/* eslint no-param-reassign: 0 */

const turf = require('@turf/turf');
const _ = require('lodash');

const { IN_KILOMETERS } = require('./constants');

const { getShstReferenceId } = require('./utils');

const getOsmNodeIdsSeq = osmWaySections =>
  osmWaySections &&
  _(osmWaySections)
    .map('nodeIds')
    .flatten()
    .value()
    .reduce((acc, nodeId) => {
      if (nodeId !== _.last(acc)) {
        acc.push(nodeId);
      }
      return acc;
    }, []);

const getShstRefGeomVerticesSeq = ({
  shstReferenceFeature,
  shstReferenceAuxProperties
}) => {
  const {
    shstReferenceId,
    shstRefGeomLengthKm,
    osmNodeIdsSeq
  } = shstReferenceAuxProperties;

  if (!osmNodeIdsSeq) {
    return null;
  }

  const shstRefGeomVerticesSeq = turf
    .explode(shstReferenceFeature)
    .features.reduce((acc, vertex, i) => {
      // add the vertex to the vertices list, skipping adjacent duplicates.
      const duplicateAdjacentVertex =
        i !== 0 && _.isEqual(vertex.geometry, _.last(acc).geometry);

      if (!duplicateAdjacentVertex) {
        vertex.properties = { osmNodeId: osmNodeIdsSeq[i] };
        acc.push(vertex);
      }
      return acc;
    }, []);

  // Happens for only two shstRefs (the forward and back refs of a single geom
  //   because two nodes share the same coords. Punting for now.
  if (osmNodeIdsSeq.length !== shstRefGeomVerticesSeq.length) {
    console.error(
      `INVARIANT BROKEN: for shstRef ${shstReferenceId}
          osmNodeIdsSeq.length (${osmNodeIdsSeq.length}) !== shstRefGeomVerticesSeq.length: (${shstRefGeomVerticesSeq.length})`
    );
    return null;
  }

  shstRefGeomVerticesSeq.forEach((vertex, i) => {
    if (i === 0) {
      vertex.properties.POFF = 0;
      vertex.properties.NOFF = shstRefGeomLengthKm;
    } else if (i === shstRefGeomVerticesSeq.length - 1) {
      vertex.properties.POFF = shstRefGeomLengthKm;
      vertex.properties.NOFF = 0;
    } else {
      const prev = shstRefGeomVerticesSeq[i - 1];
      const dist = turf.distance(prev, vertex);

      vertex.properties.POFF = prev.properties.POFF + dist;
      vertex.properties.NOFF = shstRefGeomLengthKm - vertex.properties.POFF;
    }
  });

  return shstRefGeomVerticesSeq;
};

const getShstReferenceAuxProperties = shstReferenceFeature => {
  const shstReferenceAuxProperties = {
    shstReferenceId: getShstReferenceId(shstReferenceFeature)
  };

  shstReferenceAuxProperties.shstRefGeomLengthKm = turf.length(
    shstReferenceFeature,
    IN_KILOMETERS
  );

  shstReferenceAuxProperties.osmWaySections = _.get(
    shstReferenceFeature,
    ['properties', 'osmMetadata', 'waySections'],
    null
  );

  shstReferenceAuxProperties.osmNodeIdsSeq = getOsmNodeIdsSeq(
    shstReferenceAuxProperties.osmWaySections
  );

  shstReferenceAuxProperties.shstRefGeomVerticesSeq = getShstRefGeomVerticesSeq(
    { shstReferenceFeature, shstReferenceAuxProperties }
  );

  return shstReferenceAuxProperties;
};

module.exports = getShstReferenceAuxProperties;
