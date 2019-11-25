#!/usr/bin/env node

/* eslint no-continue: 0, no-loop-func: 0, no-underscore-dangle: 0, no-restricted-syntax: 0 */

const { readFileSync } = require('fs');
const { join } = require('path');
const _ = require('lodash');
const turf = require('@turf/turf');

const nysBoundingPolygon = JSON.parse(
  readFileSync(join(__dirname, './nys.bounding.geojson'))
);

const { GEOMETRY, METADATA } = require('./constants');

const selectShStReferenceFromCandidates = require('./selectShStReferenceFromCandidates');

const roadInNYS = geomFeature =>
  nysBoundingPolygon.geometry.type === 'MultiPolygon'
    ? nysBoundingPolygon.geometry.coordinates.some(coordinates =>
        turf.booleanWithin(geomFeature, { type: 'Polygon', coordinates })
      )
    : turf.booleanWithin(geomFeature, nysBoundingPolygon);

// For each of its shst references we receive an instance of the reference's shstGeometry.
//   ShstReferences are directional. The geometries are not.
//     Therefore, a particular geometry may occur twice while iterating over
//     the geometries using a multi-secondary index on the forward and back references.
//
//   We therefore need to determine the relevant reference for a geometry instance
//      is the forward or the back reference.
//
//   Because we receive the geometry instances in sorted order by the reference ids,
//     we can determine whether we are dealing with the forward or back reference's
//     geometry instance by keeping track of the last seen shst reference id.
//
//   See code comments below for the algortithm explanation.
//
const getCurrentShStRefId = ({
  prevShStRefId,
  forwardReferenceId,
  backReferenceId
}) => {
  // Simple process of elimination
  if (forwardReferenceId && !backReferenceId) {
    return forwardReferenceId;
  }

  if (backReferenceId && !forwardReferenceId) {
    return backReferenceId;
  }

  // First iteration, take the first reference id in the sorted order
  if (prevShStRefId === null) {
    return forwardReferenceId.localeCompare(backReferenceId) <= 0
      ? forwardReferenceId
      : backReferenceId;
  }

  // Because we are passed the SharedStreetsReference IDs in sorted order, the
  //   curShStRefId would be the one most immediately following the previous curShStRefId
  return (
    _([forwardReferenceId, backReferenceId])
      // Only interested in ids following the previous id in the sorted order
      .filter(id => id.localeCompare(prevShStRefId) >= 0)
      // order those ids passing the above filter
      .sort()
      // take the id most immediately following the previous id
      .first()
  );
};

const getOsmMetadata = async (dbsByTileType, geomFeature) => {
  const {
    properties: { id: geometryId, forwardReferenceId, backReferenceId }
  } = geomFeature;

  let osmMetadata = null;

  // JOIN: shstGeometry with shstMetadata
  try {
    ({ osmMetadata } = await dbsByTileType[METADATA].get(geometryId));
  } catch (err) {
    // console.error(err);
    // console.warn('WARNING: No metadata found for shstGeometry', geometryId);
  }

  // TODO: This should be part of logging.
  if (
    osmMetadata &&
    osmMetadata.oneWay &&
    forwardReferenceId &&
    backReferenceId
  ) {
    console.warn('WARNING: one-way OSM way with two sharedstreets references.');
  }

  return osmMetadata;
};

// In the SharedStreets tileset, References are not GeoJSON features.
//   They are simply metadata objects.
//   We need to use their respective
const createForwardReferenceFeature = (geomFeature, osmMetadata) => {
  const {
    properties: {
      id: geometryId,
      fromIntersectionId,
      toIntersectionId,
      forwardReferenceId
    }
  } = geomFeature;

  const properties = {
    geometryId,
    shstReferenceId: forwardReferenceId,
    fromIntersectionId,
    toIntersectionId,
    reversed: false,
    osmMetadata
  };

  return Object.assign({}, geomFeature, { id: forwardReferenceId, properties });
};

const createBackReferenceFeature = (geomFeature, osmMetadata) => {
  const {
    properties: {
      id: geometryId,
      fromIntersectionId,
      toIntersectionId,
      backReferenceId
    },
    geometry
  } = geomFeature;

  // We need to emit the back reference for this geometry
  const reversedOsmMetadata = _.cloneDeep(osmMetadata);

  if (reversedOsmMetadata) {
    reversedOsmMetadata.waySections.reverse();
    reversedOsmMetadata.waySections.forEach(waySection =>
      waySection.nodeIds.reverse()
    );
    reversedOsmMetadata._reversed = true;
  }

  const properties = {
    geometryId,
    shstReferenceId: backReferenceId,
    fromIntersectionId: toIntersectionId,
    toIntersectionId: fromIntersectionId,
    reversed: true,
    osmMetadata: reversedOsmMetadata
  };

  const reversedCoords = geometry.coordinates.slice().reverse();

  return Object.assign({}, geomFeature, {
    id: backReferenceId,
    properties,
    geometry: { type: 'LineString', coordinates: reversedCoords }
  });
};

class ShStReferenceFeaturesAsyncIterator {
  constructor(dbsByTileType, opts) {
    this[Symbol.asyncIterator] = async function* asyncIteratorFn() {
      const shstGeomReadStream = dbsByTileType[
        GEOMETRY
      ].byReferences.createValueStream(opts);

      let prevShStRefId = null;

      const shstRefCandidates = [];

      for await (const geomFeature of shstGeomReadStream) {
        if (!roadInNYS(geomFeature)) {
          continue;
        }

        const {
          properties: { forwardReferenceId, backReferenceId }
        } = geomFeature;

        const curShStRefId = getCurrentShStRefId({
          prevShStRefId,
          forwardReferenceId,
          backReferenceId
        });

        if (prevShStRefId !== curShStRefId && shstRefCandidates.length) {
          const selectedShStRef = selectShStReferenceFromCandidates(
            shstRefCandidates
          );
          shstRefCandidates.length = 0;

          if (selectedShStRef) {
            yield selectedShStRef;
          } else {
            // FIXME: This should never be the case.
            console.error('ERROR: Could not select shstRef from candidates.');
          }
        }

        const osmMetadata = await getOsmMetadata(dbsByTileType, geomFeature);

        const feature =
          curShStRefId === forwardReferenceId
            ? createForwardReferenceFeature(geomFeature, osmMetadata)
            : createBackReferenceFeature(geomFeature, osmMetadata);

        shstRefCandidates.push(feature);
        prevShStRefId = curShStRefId;
      }

      // Done with the loop. Flush the final shstRef.
      if (shstRefCandidates.length) {
        const selectedShStRef = selectShStReferenceFromCandidates(
          shstRefCandidates
        );

        if (selectedShStRef) {
          yield selectedShStRef;
        } else {
          // FIXME: This should never be the case.
          console.error('ERROR: Could not select shstRef from candidates.');
        }
      }
    };
  }
}

module.exports = ShStReferenceFeaturesAsyncIterator;
