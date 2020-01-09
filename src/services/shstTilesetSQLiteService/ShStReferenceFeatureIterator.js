#!/usr/bin/env node

/* eslint no-continue: 0, no-loop-func: 0, no-underscore-dangle: 0, no-restricted-syntax: 0 */

const assert = require('assert');
const { readFileSync } = require('fs');
const { join } = require('path');

const turf = require('@turf/turf');
const _ = require('lodash');

const {
  NORTHBOUND,
  EASTBOUND,
  SOUTHBOUND,
  WESTBOUND
} = require('../../constants/directionOfTravel');

const geoBoundsFilePath = join(__dirname, './nys.bounding.geojson');
// const geoBoundsFilePath = join(__dirname, './albany.bounding.geojson');

const geoBoundingPolygon = JSON.parse(readFileSync(join(geoBoundsFilePath)));

const selectShStReferenceFromCandidates = require('./selectShStReferenceFromCandidates');

const roadInGeoBounds = geomFeature =>
  geoBoundingPolygon.geometry.type === 'MultiPolygon'
    ? geoBoundingPolygon.geometry.coordinates.some(coordinates =>
        turf.booleanWithin(geomFeature, { type: 'Polygon', coordinates })
      )
    : turf.booleanWithin(geomFeature, geoBoundingPolygon);

// In the SharedStreets tileset, References are not GeoJSON features.
//   They are simply metadata objects.
//   We need to use their respective
const getMicroLevelDirectionOfTravel = feature => {
  const points = _.uniqWith(turf.explode(feature).features, _.isEqual);
  const startPoint = _.first(points);
  const endPoint = _.last(points);

  const bearing = turf.bearing(startPoint, endPoint, { final: true });

  assert(bearing >= 0 && bearing <= 360);

  if (bearing <= 45 || bearing > 315) {
    return NORTHBOUND;
  }

  if (bearing > 45 || bearing <= 135) {
    return EASTBOUND;
  }

  if (bearing > 135 || bearing <= 225) {
    return SOUTHBOUND;
  }

  if (bearing > 225 || bearing <= 315) {
    return WESTBOUND;
  }

  throw new Error(`INVARIANT BROKEN: bearing = ${bearing}`);
};

const createForwardReferenceFeature = (geomFeature, osmMetadata) => {
  const {
    properties: {
      id: geometryId,
      fromIntersectionId,
      toIntersectionId,
      forwardReferenceId
    },
    geometry: { coordinates }
  } = geomFeature;

  const properties = {
    geometryId,
    shstReferenceId: forwardReferenceId,
    fromIntersectionId,
    toIntersectionId,
    reversed: false,
    osmMetadata
  };

  try {
    const feature = turf.lineString(coordinates, properties, {
      id: forwardReferenceId
    });

    feature.properties.shstReferenceMicroLevelDirectionOfTravel = getMicroLevelDirectionOfTravel(
      feature
    );

    console.log(JSON.stringify(feature, null, 4));
    return feature;
  } catch (err) {
    console.error(err);
    console.log(JSON.stringify({ coordinates, properties }, null, 4));
    throw err;
  }
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
    osmMetadata: reversedOsmMetadata
  };

  const reversedCoords = geometry.coordinates.slice().reverse();

  const feature = turf.lineString(reversedCoords, properties, {
    id: backReferenceId
  });

  feature.properties.shstReferenceMicroLevelDirectionOfTravel = getMicroLevelDirectionOfTravel(
    feature
  );

  return feature;
};

class ShStReferenceFeaturesIterator {
  constructor(iterator) {
    this[Symbol.iterator] = function* iteratorFn() {
      let prevShStRefId = null;

      const shstRefCandidates = [];

      for (const row of iterator) {
        try {
          const { shst_reference_id, geom_feature, metadata, is_forward } = row;
          const geomFeature = JSON.parse(geom_feature);
          const { osmMetadata = null } = metadata ? JSON.parse(metadata) : {};

          if (!roadInGeoBounds(geomFeature)) {
            continue;
          }

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
        } catch (err) {
          console.error(err);
        }
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
