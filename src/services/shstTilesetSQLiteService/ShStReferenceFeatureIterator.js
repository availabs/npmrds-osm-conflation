#!/usr/bin/env node

/* eslint no-continue: 0, no-loop-func: 0, no-underscore-dangle: 0, no-restricted-syntax: 0 */

const _ = require('lodash');

const { shstOsmWayRoadClassRankings } = require('../../conflation/constants');

// const nysBoundingPolygon = JSON.parse(
// readFileSync(join(__dirname, './nys.bounding.geojson'))
// );

const selectShStReferenceFromCandidates = require('./selectShStReferenceFromCandidates');

// const roadInNYS = geomFeature =>
// nysBoundingPolygon.geometry.type === 'MultiPolygon'
// ? nysBoundingPolygon.geometry.coordinates.some(coordinates =>
// turf.booleanWithin(geomFeature, { type: 'Polygon', coordinates })
// )
// : turf.booleanWithin(geomFeature, nysBoundingPolygon);

// In the SharedStreets tileset, References are not GeoJSON features.
//   They are simply metadata objects.
//   We need to use their respective

const getNetworkLevel = osmMetadata => {
  const roadClass = (osmMetadata && osmMetadata.roadClass) || 'Other';

  let networklevel = shstOsmWayRoadClassRankings[roadClass];

  const oneWay = (osmMetadata && osmMetadata.oneWay) || false;

  if (oneWay) {
    networklevel += 0.5;
  }

  return networklevel;
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
    osmMetadata,
    networklevel: getNetworkLevel(osmMetadata)
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
  const reversedOsmMetadata = _.cloneDeep(osmMetadata) || null;

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
    osmMetadata: reversedOsmMetadata,
    networklevel: getNetworkLevel(osmMetadata)
  };

  const reversedCoords = geometry.coordinates.slice().reverse();

  return Object.assign({}, geomFeature, {
    id: backReferenceId,
    properties,
    geometry: { type: 'LineString', coordinates: reversedCoords }
  });
};

class ShStReferenceFeaturesIterator {
  constructor(iterator) {
    this[Symbol.iterator] = function* asyncIteratorFn() {
      let prevShStRefId = null;

      const shstRefCandidates = [];

      for (const row of iterator) {
        const { shst_reference_id, geom_feature, metadata, is_forward } = row;
        const geomFeature = JSON.parse(geom_feature);
        const { osmMetadata = null } = metadata ? JSON.parse(metadata) : {};

        // if (!roadInNYS(geomFeature)) {
        // console.error(JSON.stringify(geomFeature.geometry.coordinates));
        // continue;
        // }

        const curShstRefId = shst_reference_id;

        if (prevShStRefId !== curShstRefId && shstRefCandidates.length) {
          const selectedShStRef = selectShStReferenceFromCandidates(
            shstRefCandidates
          );
          shstRefCandidates.length = 0;

          if (selectedShStRef) {
            yield selectedShStRef;
          } else {
            // FIXME: This should never be the case. Throw instead.
            console.error('ERROR: Could not select shstRef from candidates.');
          }
        }

        const feature = is_forward
          ? createForwardReferenceFeature(geomFeature, osmMetadata)
          : createBackReferenceFeature(geomFeature, osmMetadata);

        shstRefCandidates.push(feature);
        prevShStRefId = curShstRefId;
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

module.exports = ShStReferenceFeaturesIterator;
