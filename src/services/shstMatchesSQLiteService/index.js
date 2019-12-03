#!/usr/bin/env node

/* eslint no-restricted-syntax: 0 */

const { join } = require('path');
const _ = require('lodash');

const Database = require('better-sqlite3');

const makeShstReferenceChains = require('./getShstReferenceChains');

const getGeoProximityKeyPrefix = require('../../utils/getGeoProximityKeyPrefix');

const SQLITE_PATH = join(__dirname, '../../../data/sqlite/');

const SHST_MATCHES_SQLITE_PATH = join(SQLITE_PATH, 'shst_matches');

const db = new Database(SHST_MATCHES_SQLITE_PATH);

// https://github.com/JoshuaWise/better-sqlite3/issues/125#issuecomment-386752196
// db.pragma('journal_mode = WAL');

// Initialize the database
db.exec(`
    BEGIN;

    CREATE TABLE IF NOT EXISTS shst_matches (
      shst_reference_id          TEXT NOT NULL,
      shst_from_intersection_id  TEXT NOT NULL,
      shst_to_intersection_id    TEXT NOT NULL,
      target_map                 TEXT NOT NULL,
      target_map_id              TEXT NOT NULL,
      feature                    TEXT NOT NULL,
      PRIMARY KEY(
        shst_reference_id,
        shst_from_intersection_id,
        shst_to_intersection_id,
        target_map,
        target_map_id
      )
    ) WITHOUT ROWID;

    CREATE INDEX IF NOT EXISTS shst_matches_shstref_idx
      ON shst_matches(shst_reference_id);

    CREATE INDEX IF NOT EXISTS shst_matched_target_map_id
      ON shst_matches(target_map, target_map_id);

    COMMIT;
  `);

// Prepared statement for shst match output INSERTs
const shstMatchInputStatement = db.prepare(`
  INSERT INTO shst_matches (
    shst_reference_id,
    shst_from_intersection_id,
    shst_to_intersection_id,
    target_map,
    target_map_id,
    feature
  ) VALUES(?, ?, ?, ?, ?, ?);
`);

// INSERT the shst match output
const putFeatures = matchFeatures => {
  if (!(matchFeatures && matchFeatures.length)) {
    return;
  }

  const matchFeaturesArr = Array.isArray(matchFeatures)
    ? matchFeatures
    : [matchFeatures];

  for (let i = 0; i < matchFeaturesArr.length; i++) {
    const feature = matchFeaturesArr[i];

    const {
      properties: {
        shstReferenceId,
        shstFromIntersectionId,
        shstToIntersectionId,
        targetMap,
        targetMapId
      }
    } = feature;

    try {
      shstMatchInputStatement.run(
        shstReferenceId,
        shstFromIntersectionId,
        shstToIntersectionId,
        targetMap,
        targetMapId,
        JSON.stringify(feature)
      );
    } catch (err) {
      //
    }
  }
};

// Query to create a cursor over all shst match output features for a given targetMap.
const targetMapFeatureIteratorQuery = db.prepare(`
  SELECT
      feature
    FROM shst_matches
    WHERE ( target_map = ? )
    ORDER BY target_map_id
`);

// Makes an iterator over all shst match output features for a given targetMap
function* makeTargetMapFeatureIterator(targetMap) {
  const iterator = targetMapFeatureIteratorQuery.iterate([targetMap]);

  for (const { feature } of iterator) {
    yield JSON.parse(feature);
  }
}

// Query to create a cursor over all shst match output features.
//   Generator function takes care of GROUP BY to create nested JSON object.
const matchFeaturesForShstReferenceByTargetMapIteratorQuery = db.prepare(`
  SELECT
      shst_reference_id,
      target_map,
      target_map_id,
      feature
    FROM shst_matches
    ORDER BY shst_reference_id, target_map, target_map_id
`);

// Makes an iterator over all shst match output features,
//   grouped by shstReferenceIds, then targetMap.
//   Returned data structure: { [targetMap]: [...matchFeatures] }
function* makeMatchFeaturesForShstReferenceByTargetMapIterator() {
  const iterator = matchFeaturesForShstReferenceByTargetMapIteratorQuery.iterate();

  let curShstRef;
  let accumulator;

  for (const { shst_reference_id, target_map, feature } of iterator) {
    if (curShstRef !== shst_reference_id) {
      if (!_.isEmpty(accumulator)) {
        yield accumulator;
      }
      curShstRef = shst_reference_id;
      accumulator = {};
    }

    accumulator[target_map] = accumulator[target_map] || [];
    accumulator[target_map].push(JSON.parse(feature));
  }

  if (!_.isEmpty(accumulator)) {
    yield accumulator;
  }
}

// Query to create a simple cursor over all shst match output features.
const allMatchedFeaturesIteratorQuery = db.prepare(`
  SELECT feature
    FROM shst_matches
`);

// Makes an iterator over all shst match output features.
function* makeAllMatchedFeaturesIterator() {
  const iterator = allMatchedFeaturesIteratorQuery.iterate();

  for (const { feature } of iterator) {
    yield JSON.parse(feature);
  }
}

// Query to get all matches for a given shstReference.
const matchesByTargetMapForShStReferenceQuery = db.prepare(`
  SELECT
      target_map,
      target_map_id,
      feature
    FROM shst_matches
    WHERE ( shst_reference_id = ? ) ;
`);

// Returns all matches for a given shstReference, grouped by targetMap, then targetMapId
//   Returned data structure:
//   {
//     [targetMap]: {
//       [targetMapId]: [...matchFeatures]
//     }
//   }
const getMatchesByTargetMapForShStReference = shstReferenceId => {
  const result = matchesByTargetMapForShStReferenceQuery.all([shstReferenceId]);
  const accumulator = {};

  for (let i = 0; i < result.length; ++i) {
    const { target_map, feature } = result[i];

    accumulator[target_map] = accumulator[target_map] || [];

    accumulator[target_map].push(JSON.parse(feature));
  }

  return accumulator;
};

// Queries all the shst road network information for a matched target map segment.
//   Used to topologically sort the shstReferences for that matched target map segment.
const shstReferencesChainForTargetMapMatchQuery = db.prepare(`
  SELECT
      shst_reference_id,
      shst_from_intersection_id,
      shst_to_intersection_id
    FROM shst_matches
    WHERE (
      ( target_map = ? )
      AND
      ( target_map_id = ? )
    ) ;
`);

// Returns the topologically sorted shstReferences for the given target map segment.
const getShstReferenceChains = (targetMap, targetMapId) => {
  const result = shstReferencesChainForTargetMapMatchQuery.all([
    targetMap,
    targetMapId
  ]);

  if (!result.length) {
    console.error('WARNING: No network edges info for', targetMap, targetMapId);
    return null;
  }

  const shstNetEdges = result.map(row =>
    _.mapKeys(row, (v, k) => _.camelCase(k))
  );

  try {
    return makeShstReferenceChains(shstNetEdges);
  } catch (err) {
    console.error(err);
    return null;
  }
};

const allMatchedSegmentsForTargetMap = db.prepare(`
  SELECT DISTINCT target_map_id
    FROM shst_matches
    WHERE ( target_map = ? ) ;
`);

const getSetOfAllMatchedSementsForTargetMap = targetMap =>
  new Set(
    allMatchedSegmentsForTargetMap
      .all([targetMap])
      .map(({ target_map_id }) => target_map_id)
  );

const allMatchedFeatureCoordinatedForTargetMap = db.prepare(`
  SELECT json_extract(feature, '$.geometry.coordinates')
    FROM shst_matches
    WHERE ( target_map = ? )
`);

const getMaxMatchedSegmentGeoProximityKeyForTargetMap = targetMap => {
  let maxGeoProxKey = String.fromCharCode(0);

  const iterator = allMatchedFeatureCoordinatedForTargetMap
    .raw()
    .iterate([targetMap]);

  for (const strCoords of iterator) {
    const coords = JSON.parse(strCoords);

    const gpk = getGeoProximityKeyPrefix(coords);

    if (maxGeoProxKey.localeCompare(gpk) < 0) {
      maxGeoProxKey = gpk;
    }
  }

  return maxGeoProxKey;
};

module.exports = {
  putFeatures,
  makeTargetMapFeatureIterator,
  makeMatchFeaturesForShstReferenceByTargetMapIterator,
  makeAllMatchedFeaturesIterator,
  getMatchesByTargetMapForShStReference,
  getShstReferenceChains,
  getSetOfAllMatchedSementsForTargetMap,
  getMaxMatchedSegmentGeoProximityKeyForTargetMap
};
