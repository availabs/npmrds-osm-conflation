#!/usr/bin/env node

/* eslint no-restricted-syntax: 0 */

const { join } = require('path');

const _ = require('lodash');

const Database = require('better-sqlite3');

const SQLITE_PATH = join(__dirname, '../../../data/sqlite/');

const CONFLATION_MAP_SQLITE_PATH = join(SQLITE_PATH, 'conflation_map');

const db = new Database(CONFLATION_MAP_SQLITE_PATH);

// https://github.com/JoshuaWise/better-sqlite3/issues/203
const tmpDatabase = join(SQLITE_PATH, 'conflation_map_segidx_lookup');
const tmpDb = new Database(tmpDatabase);

// https://github.com/JoshuaWise/better-sqlite3/issues/125#issuecomment-386752196
// db.pragma('journal_mode = WAL');

// Initialize the database
db.exec(`
  BEGIN;

  CREATE TABLE IF NOT EXISTS conflation_map (
    id       TEXT PRIMARY KEY,
    feature  TEXT NOT NULL --JSON
  ) WITHOUT ROWID;

  COMMIT;
`);

// Prepared statement for INSERTs
const conflationMapFeaturesInputStatement = db.prepare(`
  INSERT INTO conflation_map (
    id,
    feature
  ) VALUES(?, ?);
`);

// INSERT the shst geometry
const insertConflationMapFeatures = features => {
  if (!features) {
    return;
  }

  const featuresArr = Array.isArray(features)
    ? features.filter(_.negate(_.isNil))
    : [features];

  if (!featuresArr.length) {
    return;
  }

  for (let i = 0; i < featuresArr.length; i++) {
    const feature = featuresArr[i];

    const { id } = feature;

    try {
      conflationMapFeaturesInputStatement.run([id, JSON.stringify(feature)]);
    } catch (err) {
      // console.error(err)
    }
  }
};

// Prepared statement for joining db tables for shstReference Feature iterator creation.
const conflationMapFeatureIteratorQuery = db.prepare(`
  SELECT feature
    FROM conflation_map
    ORDER BY id
`);

function* makeConflationMapFeatureIterator() {
  const iterator = conflationMapFeatureIteratorQuery.raw().iterate();

  for (const [strFeature] of iterator) {
    const feature = JSON.parse(strFeature);
    yield feature;
  }
}

const createTempConflationMapSegIndexForTargetMapSegLookupTable = tblName => {
  tmpDb.exec(`
    BEGIN;

    CREATE TABLE IF NOT EXISTS ${tblName} (
      conflation_map_id   TEXT PRIMARY KEY,
      target_map_seg_idx  INTEGER NOT NULL
    ) WITHOUT ROWID ;

    COMMIT ; `);
};

const conflationMapSegIndexesStmtsByTargetMap = {};
const initializeConflationMapSegIdxStatementsForTargetMap = targetMap => {
  const stmts = conflationMapSegIndexesStmtsByTargetMap[targetMap];

  if (stmts) {
    return stmts;
  }

  const tblName = `${targetMap}_conf_seg_idx_lookup`;

  createTempConflationMapSegIndexForTargetMapSegLookupTable(tblName);

  const insertStmt = tmpDb.prepare(`
    INSERT INTO ${tblName} (
      conflation_map_id,
      target_map_seg_idx
    ) VALUES (?, ?) ;`);

  const selectStmt = tmpDb.prepare(`
    SELECT target_map_seg_idx
      FROM ${tblName}
      WHERE ( conflation_map_id = ? ) ;`);

  conflationMapSegIndexesStmtsByTargetMap[targetMap] = {
    insertStmt,
    selectStmt
  };

  return conflationMapSegIndexesStmtsByTargetMap[targetMap];
};

const insertConflationMapSegIndexesForTargetMapSegment = (
  targetMap,
  targetMapSegIndexes
) => {
  if (_.isNil(targetMap)) {
    throw new Error('The targetMap parameter is required.');
  }

  if (!Array.isArray(targetMapSegIndexes)) {
    throw new Error('targetMapSegIndexes must be an array.');
  }

  const { insertStmt } = initializeConflationMapSegIdxStatementsForTargetMap(
    targetMap
  );

  for (let i = 0; i < targetMapSegIndexes.length; ++i) {
    const { conflationMapId, targetMapSegIdx } = targetMapSegIndexes[i];
    try {
      insertStmt.run([conflationMapId, targetMapSegIdx]);
    } catch (err) {
      console.error(
        JSON.stringify(
          { msg: 'INSERT ERROR', conflationMapId, targetMapSegIdx },
          null,
          4
        )
      );
      console.error(err);
    }
  }
};

const getConflationMapSegIndexForTargetMapSegment = (
  targetMap,
  shstReferenceId
) => {
  const { selectStmt } = initializeConflationMapSegIdxStatementsForTargetMap(
    targetMap
  );

  if (!selectStmt) {
    throw new Error(`${targetMap}_conf_seg_idx_lookup has not been created`);
  }

  const [targetMapSegIdx = null] =
    selectStmt.raw().get([shstReferenceId]) || [];

  return targetMapSegIdx;
};

function* makeConflationMapIdsGroupedByTargetMapSegmentsIterator(targetMap) {
  const q = db.prepare(`
    SELECT
        JSON_EXTRACT(feature, '$.properties.${targetMap}'),
        GROUP_CONCAT(id)
      FROM conflation_map
      WHERE ( JSON_EXTRACT(feature, '$.properties.${targetMap}') IS NOT NULL )
      GROUP BY 1 ;`);

  const iterator = q.raw().iterate();

  for (const [targetMapId, conflationMapIdsStr] of iterator) {
    const conflationMapIds = conflationMapIdsStr.split(',');
    yield { targetMapId, conflationMapIds };
  }
}

module.exports = {
  insertConflationMapFeatures,
  makeConflationMapFeatureIterator,
  insertConflationMapSegIndexesForTargetMapSegment,
  getConflationMapSegIndexForTargetMapSegment,
  makeConflationMapIdsGroupedByTargetMapSegmentsIterator
};
