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

const RIS_LEVELDB_DIR = join(LEVELDB_DIR, 'ris');

mkdirSync(RIS_LEVELDB_DIR, { recursive: true });

const getFeatureId = ({ properties: { gis_id, beg_mp } }) =>
  `${gis_id}##${beg_mp}`;

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
  validateYearParam(year) && join(RIS_LEVELDB_DIR, `${year}`);

const dbsByYear = {};

// This function MUST be called for every year database,
//   even those already existing on disk.
//   It is REQUIRED to set up runtime behavior.
const initializeYearDb = async year => {
  validateYearParam(year);

  // Guarantee idempotency within process
  if (dbsByYear[year]) {
    return dbsByYear[year];
  }

  const dir = getDataYearLevelDbDir(year);

  // This is necessary because opening the underlying levelup store is async.
  //   Without the callback, read and write operations are queued.
  //   Destroying the store while it is asynchronously opening
  //     causes a race condition and potentially errors.
  // See https://github.com/Level/levelup#levelupdb-options-callback
  const yearDb = await new Promise((resolve, reject) =>
    levelup(encode(leveldown(dir), JSON_ENCODING), (err, db) => {
      if (err) {
        console.error(err);
        return reject(err);
      }

      return resolve(db);
    })
  );

  const data = sub(yearDb, 'data', JSON_ENCODING);

  // This sublevel holds the geoproximity secondary index that is
  // used to iterate over the ris features while preserving
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

// Get the year subdirectories of RIS_LEVELDB_DIR
const allYearDatabasesInitialized = Promise.all(
  readdirSync(RIS_LEVELDB_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && /^\d{4}$/.test(dirent.name))
    .map(({ name: year }) => initializeYearDb(year))
);

const getDataYears = async () =>
  (await allYearDatabasesInitialized) &&
  Object.keys(dbsByYear)
    .sort()
    .map(_.toInteger);

const getYearDb = async (year, create) => {
  validateYearParam(year);
  await allYearDatabasesInitialized;

  const yearDb = dbsByYear[year];

  if (yearDb) {
    return yearDb;
  }

  if (create) {
    return initializeYearDb(year);
  }

  throw new Error('ERROR: data year does not exist');
};

const makeBatchPutOperation = feature => {
  // eslint-disable-next-line no-param-reassign
  feature.id = getFeatureId(feature);

  return {
    type: 'put',
    key: feature.id,
    value: feature
  };
};

const destroyYearDb = async year => {
  validateYearParam(year);
  await allYearDatabasesInitialized;

  if (dbsByYear[year]) {
    delete dbsByYear[year];
    const dir = getDataYearLevelDbDir(year);
    rimrafSync(dir);
  }
};

const destroy = () => Promise.all(Object.keys(dbsByYear).map(destroyYearDb));

const putFeatures = async ({ year, features, destroyOnError }) => {
  validateYearParam(year);
  if (!features) {
    return;
  }

  const yearDb = await getYearDb(year, true);

  const ops = Array.isArray(features)
    ? features.map(makeBatchPutOperation)
    : [makeBatchPutOperation(features)];

  for (let i = 0; i < ops.length; ++i) {
    if (!ops[i].value) {
      console.error(JSON.stringify(ops, null, 4));
    }
  }

  try {
    await yearDb.batch(ops);
  } catch (err) {
    console.error(err);
    if (destroyOnError) {
      await destroyYearDb(year);
    }
    process.exit(1);
  }
};

const putFeature = ({ year, feature }) =>
  putFeatures({ year, features: feature });

async function* makeFeatureAsyncIterator(year, opts) {
  validateYearParam(year);

  const yearDb = await getYearDb(year);

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

  const yearDb = await getYearDb(year);

  for await (const feature of yearDb.byGeoProximityIdx.createValueStream(
    opts
  )) {
    yield feature;
  }
}

const getFeature = async ({ year, id }) => {
  validateYearParam(year);

  const yearDb = await getYearDb(year);

  const feature = await yearDb.get(id);

  return feature || null;
};

module.exports = {
  putFeatures,
  putFeature,
  getFeature,
  makeFeatureAsyncIterator,
  makeGeoProximityFeatureAsyncIterator,
  getDataYears,
  destroyYearDb,
  destroy
};
