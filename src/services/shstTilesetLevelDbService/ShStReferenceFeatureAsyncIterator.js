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

const selectShStReference = require('./selectShStReference');

// https://github.com/sharedstreets/sharedstreets-types/blob/3c1d5822ff4943ae063f920e018dd3e349213c8c/index.ts#L33-L44
const shstOsmWayRoadClass = {
  Motorway: 0,
  Trunk: 1,
  Primary: 2,
  Secondary: 3,
  Tertiary: 4,
  Residential: 5,
  Unclassified: 6,
  Service: 7,
  Other: 8
};

const roadInNYS = geomFeature =>
  nysBoundingPolygon.geometry.type === 'MultiPolygon'
    ? nysBoundingPolygon.geometry.coordinates.some(coordinates =>
        turf.booleanWithin(geomFeature, { type: 'Polygon', coordinates })
      )
    : turf.booleanWithin(geomFeature, nysBoundingPolygon);

// We receive an instance of each geometry feature for each of its shst references.
//   We receive the geometries in sorted order by the reference ids.
//   By keeping track of the last seen shst reference id, we can determine
//   which of the geometry's references the current geometry instance belongs to.
const getCurrentShStRefId = ({
  prevShStRefId,
  forwardReferenceId,
  backReferenceId
}) => {
  if (forwardReferenceId && !backReferenceId) {
    return forwardReferenceId;
  }

  if (backReferenceId && !forwardReferenceId) {
    return backReferenceId;
  }

  if (prevShStRefId === null) {
    // First iteration, take the first reference id in the sorted order
    return forwardReferenceId.localeCompare(backReferenceId) <= 0
      ? forwardReferenceId
      : backReferenceId;
  }

  // Because we are passed the SharedStreetsReference IDs in sorted order,
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

  if (osmMetadata && Array.isArray(osmMetadata.waySections)) {
    const { waySections } = osmMetadata;

    // WARNING: Object mutations
    for (let i = 0; i < waySections.length; ++i) {
      const waySection = waySections[i];
      const { roadClass } = waySection;
      // TODO: Rename the fsystem property, or make it true FHWA fsystem
      waySection.fsystem = Number.isFinite(shstOsmWayRoadClass[roadClass])
        ? shstOsmWayRoadClass[roadClass]
        : shstOsmWayRoadClass.Other;
    }
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
          const selectedShStRef = selectShStReference(shstRefCandidates);
          shstRefCandidates.length = 0;
          yield selectedShStRef;
        }

        const osmMetadata = await getOsmMetadata(dbsByTileType, geomFeature);

        const feature =
          curShStRefId === forwardReferenceId
            ? createForwardReferenceFeature(geomFeature, osmMetadata)
            : createBackReferenceFeature(geomFeature, osmMetadata);

        shstRefCandidates.push(feature);
        prevShStRefId = curShStRefId;
      }

      if (shstRefCandidates.length) {
        const selectedShStRef = selectShStReference(shstRefCandidates);
        yield selectedShStRef;
      }
    };
  }
}

module.exports = ShStReferenceFeaturesAsyncIterator;

/*
console.error(
  JSON.stringify(
    _.sortBy(
      [
        { k: 'prevShStRefId', v: prevShStRefId },
        { k: 'curShStRefId', v: curShStRefId },
        { k: 'forwardReference', v: forwardReferenceId },
        { k: 'backReferenceId', v: backReferenceId }
      ],
      'v'
    ),
    null,
    4
  )
);
*/
