#!/usr/bin/env node

/* eslint no-restricted-syntax: 0 */

const { join } = require('path');

const Database = require('better-sqlite3');

// const SQLITE_PATH = join(__dirname, '../../../data/sqlite/');
const SQLITE_PATH = join(__dirname, '../../../tmpsqlite');

const CONFLATION_MAP_SQLITE_PATH = join(SQLITE_PATH, 'conflation_map');

const db = new Database(CONFLATION_MAP_SQLITE_PATH);

// https://github.com/JoshuaWise/better-sqlite3/issues/125#issuecomment-386752196
// db.pragma('journal_mode = WAL');

// Initialize the database
db.exec(`
  BEGIN;

  CREATE TABLE IF NOT EXISTS conflation_map (
    id       INTEGER PRIMARY KEY,
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
const insertConflationMapFeature = feature => {
  const { id } = feature;

  try {
    conflationMapFeaturesInputStatement.run([id, JSON.stringify(feature)]);
  } catch (err) {
    // console.error(err)
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

module.exports = {
  insertConflationMapFeature,
  makeConflationMapFeatureIterator
};
