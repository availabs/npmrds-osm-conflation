#!/usr/bin/env node

/* eslint no-restricted-syntax: 0 */

const { readdirSync, mkdirSync } = require('fs');
const { join } = require('path');

const { sync: rimrafSync } = require('rimraf');
const _ = require('lodash');

const levelup = require('levelup');
const leveldown = require('leveldown');
const encode = require('encoding-down');
const sub = require('subleveldown');
const AutoIndex = require('level-auto-index');

const getGeoProximityKeyPrefix = require('../../utils/getGeoProximityKeyPrefix');

const LEVELDB_DIR = join(__dirname, '../../../data/leveldb/');

const JSON_ENCODING = { valueEncoding: 'json' };

const NPMRDS_LEVELDB_DIR = join(LEVELDB_DIR, 'npmrds');

mkdirSync(NPMRDS_LEVELDB_DIR, { recursive: true });

const getFeatureId = ({ properties: { tmc } }) => tmc;

const validateYearParam = year => {
  if (!year) {
    throw new Error('year parameter is required.');
  }

  if (!/^\d{4}$/.test(`${year}`)) {
    throw new Error('year parameter must be a four digit integer.');
  }

  return true;
};

const getDataYearLevelDbDir = year =>
  validateYearParam(year) && join(NPMRDS_LEVELDB_DIR, `${year}`);

const dbsByYear = {};

// This function MUST be called for every year database,
//   even those already existing on disk.
//   It is REQUIRED to set up runtime behavior.
const initializeYearDb = year => {
  validateYearParam(year);

  // Guarantee idempotency within process
  if (dbsByYear[year]) {
    return dbsByYear[year];
  }

  const dir = getDataYearLevelDbDir(year);

  const yearDb = levelup(encode(leveldown(dir), JSON_ENCODING));

  const data = sub(yearDb, 'data', JSON_ENCODING);

  // This sublevel holds the geoproximity secondary index that is
  // used to iterate over the npmrds features while preserving
  // the geographic proximity of iteration sequence neighbors.
  const geoProximityIdx = sub(yearDb, 'geoProximityIdx', JSON_ENCODING);

  // set up automatic secondary indexing
  data.byGeoProximityIdx = AutoIndex(data, geoProximityIdx, feature => {
    const {
      geometry: { coordinates }
    } = feature;

    const prefix = getGeoProximityKeyPrefix(coordinates);
    const id = getFeatureId(feature);

    return `${prefix}##${id}`;
  });

  dbsByYear[year] = data;

  return data;
};

// Get the year subdirectories of NPMRDS_LEVELDB_DIR
readdirSync(NPMRDS_LEVELDB_DIR, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory() && /^\d{4}$/.test(dirent.name))
  .map(({ name: year }) => initializeYearDb(year));

const getDataYears = () =>
  Object.keys(dbsByYear)
    .sort()
    .map(_.toInteger);

const getYearDb = (year, create) => {
  validateYearParam(year);

  const yearDb = dbsByYear[year];

  if (yearDb) {
    return yearDb;
  }

  if (create) {
    return initializeYearDb(year);
  }

  throw new Error('ERROR: data year does not exist');
};

const makeBatchPutOperation = feature => ({
  type: 'put',
  key: getFeatureId(feature),
  value: feature
});

const putFeatures = async ({ year, features, destroyOnError = true }) => {
  validateYearParam(year);

  if (!features) {
    return;
  }

  const yearDb = getYearDb(year, true);

  const ops = Array.isArray(features)
    ? features.map(makeBatchPutOperation)
    : [makeBatchPutOperation(features)];

  try {
    await yearDb.batch(ops);
  } catch (err) {
    console.error(err);
    if (destroyOnError) {
      const dir = getDataYearLevelDbDir(year);
      rimrafSync(dir);
    }
    process.exit(1);
  }
};

const putFeature = ({ year, feature }) =>
  putFeatures({ year, features: feature });

async function* makeFeatureAsyncIterator(year, opts) {
  validateYearParam(year);

  const yearDb = getYearDb(year);

  for await (const feature of yearDb.createValueStream(opts)) {
    yield feature;
  }
}

/**
 * Using the secondary index incurs a steep performance penalty.
 * If the geography proximity of iteration sequence neighbors is not necessary,
 *   use makeFeatureAsyncIterator.
 * This iterator generator exists to support microbatching calls to shst match.
 *   Outside of this use case, it probably is not necessary.
 */
async function* makeGeoProximityFeatureAsyncIterator(year, opts) {
  validateYearParam(year);

  const yearDb = getYearDb(year);

  for await (const feature of yearDb.byGeoProximityIdx.createValueStream(
    opts
  )) {
    yield feature;
  }
}

module.exports = {
  putFeatures,
  putFeature,
  makeFeatureAsyncIterator,
  makeGeoProximityFeatureAsyncIterator,
  getDataYears
};
