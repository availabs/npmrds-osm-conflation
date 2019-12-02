#!/usr/bin/env node

/* eslint no-restricted-syntax: 0 */

const { join } = require('path');

const _ = require('lodash');

const Database = require('better-sqlite3');

const SQLITE_PATH = join(__dirname, '../../../data/sqlite/');

const CONFLATION_MAP_SQLITE_PATH = join(SQLITE_PATH, 'conflation_map');

const db = new Database(CONFLATION_MAP_SQLITE_PATH);

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
`);

function* makeConflationMapFeatureIterator() {
  const iterator = conflationMapFeatureIteratorQuery.raw().iterate();

  for (const [strFeature] of iterator) {
    const feature = JSON.parse(strFeature);
    yield feature;
  }
}

module.exports = {
  insertConflationMapFeatures,
  makeConflationMapFeatureIterator
};
