#!/usr/bin/env node

/* eslint no-restricted-syntax: 0 */

const { readdirSync, mkdirSync } = require('fs');
const { dirname, join } = require('path');

const { sync: rimrafSync } = require('rimraf');
const _ = require('lodash');

const levelup = require('levelup');
const leveldown = require('leveldown');
const encode = require('encoding-down');

const LEVELDB_DIR = join(__dirname, '../../../data/leveldb/');

const JSON_ENCODING = { valueEncoding: 'json' };

const SHST_MATCHES_LEVELDB_DIR = join(LEVELDB_DIR, 'shst_matches');

mkdirSync(SHST_MATCHES_LEVELDB_DIR, { recursive: true });

const getFeatureId = feature => {
  const {
    properties: { shstReferenceId, gisSegmentIndex, data_source_id }
  } = feature;

  if (
    _.isNil(shstReferenceId) ||
    _.isNil(gisSegmentIndex) ||
    _.isNil(data_source_id)
  ) {
    throw new Error(
      'ERROR: shstMatches features MUST have shstReferenceId, gisSegmentIndex, and data_source_id properties.'
    );
  }

  return `${shstReferenceId}::${gisSegmentIndex}::${data_source_id}`;
};

const validateYearParam = year => {
  if (_.isNil(year)) {
    throw new Error('year parameter is required.');
  }

  if (!/^\d{4}$/.test(`${year}`)) {
    throw new Error('year parameter must be a four digit integer.');
  }

  return true;
};

const validateDataSourceParam = dataSource => {
  if (_.isNil(dataSource)) {
    throw new Error('dataSource parameter is required');
  }

  if (!/^[A-Z0-9_]{1,}$/i.test(`${dataSource}`)) {
    throw new Error(
      'Valid dataSource name characters are A-Z, a-z, 0-9, and _'
    );
  }

  return true;
};

const dbsByDataSourceByYear = {};

const getDataSourceYearLevelDbDir = (dataSource, year) =>
  validateDataSourceParam(dataSource) &&
  validateYearParam(year) &&
  join(SHST_MATCHES_LEVELDB_DIR, dataSource, `${year}`);

const getDataSources = () => Object.keys(dbsByDataSourceByYear).sort();

const getDataSourceYears = dataSource =>
  validateDataSourceParam(dataSource) &&
  Object.keys(_.get(dbsByDataSourceByYear, [dataSource], []))
    .sort()
    .map(_.toInteger);

// This function MUST be called for every year database,
//   even those already existing on disk.
//   It is REQUIRED to set up runtime behavior.
const initializeDataSourceYearDb = async (dataSource, year) => {
  validateDataSourceParam(dataSource);
  validateYearParam(year);

  let db = _.get(dbsByDataSourceByYear, [dataSource, year], null);

  // Guarantee idempotency within process
  if (db) {
    return db;
  }

  const dir = getDataSourceYearLevelDbDir(dataSource, year);

  mkdirSync(dirname(dir), { recursive: true });

  // This is necessary because opening the underlying levelup store is async.
  //   Without the callback, read and write operations are queued.
  //   Destroying the store while it is asynchronously opening
  //     causes a race condition and potentially errors.
  // See https://github.com/Level/levelup#levelupdb-options-callback
  db = await new Promise((resolve, reject) =>
    levelup(encode(leveldown(dir), JSON_ENCODING), (err, openedDb) => {
      if (err) {
        console.error(err);
        return reject(err);
      }

      return resolve(openedDb);
    })
  );

  _.set(dbsByDataSourceByYear, [dataSource, year], db);

  return db;
};

// Get the year subdirectories of SHST_MATCHES_LEVELDB_DIR
const allYearDatabasesInitialized = Promise.all(
  _(readdirSync(SHST_MATCHES_LEVELDB_DIR, { withFileTypes: true }))
    .filter(
      dirent => dirent.isDirectory() && /^[A-Z0-9_]{1,}$/i.test(dirent.name)
    )
    .map(dataSource => {
      const dataSourceYears = readdirSync(SHST_MATCHES_LEVELDB_DIR, {
        withFileTypes: true
      }).filter(dirent => dirent.isDirectory() && /^\d{4}$/.test(dirent.name));

      return dataSourceYears.map(year => ({ dataSource, year }));
    })
    .flatten()
    .map(({ dataSource, year }) => initializeDataSourceYearDb(dataSource, year))
);

const getDataSourceYearDb = async (dataSource, year, create) => {
  validateDataSourceParam(dataSource);
  validateYearParam(year);

  await allYearDatabasesInitialized;

  const yearDb = _.get(dbsByDataSourceByYear, [dataSource, year], null);

  if (yearDb) {
    return yearDb;
  }

  if (create) {
    return initializeDataSourceYearDb(dataSource, year);
  }

  throw new Error('ERROR: data year does not exist');
};

const makeBatchPutOperation = feature => ({
  type: 'put',
  key: getFeatureId(feature),
  value: feature
});

const destroyDataSourceYearDb = async (dataSource, year) => {
  validateDataSourceParam(dataSource);
  validateYearParam(year);

  await allYearDatabasesInitialized;

  const db = _.get(dbsByDataSourceByYear, [dataSource, year], null);

  if (db) {
    delete dbsByDataSourceByYear[dataSource][year];
    const dir = getDataSourceYearLevelDbDir(dataSource, year);
    rimrafSync(dir);
  }
};

const destroyDataSourceDb = dataSource =>
  validateDataSourceParam(dataSource) &&
  dbsByDataSourceByYear[dataSource] &&
  Promise.all(
    Object.keys(dbsByDataSourceByYear[dataSource]).map(year =>
      destroyDataSourceYearDb(dataSource, year)
    )
  );

const destroy = () =>
  Object.keys(dbsByDataSourceByYear).map(destroyDataSourceDb);

const putFeatures = async ({
  dataSource,
  year,
  features,
  destroyOnError = true
}) => {
  if (!features) {
    return;
  }

  const db = await getDataSourceYearDb(dataSource, year, true);

  const ops = Array.isArray(features)
    ? features.map(makeBatchPutOperation)
    : [makeBatchPutOperation(features)];

  try {
    await db.batch(ops);
  } catch (err) {
    console.error(err);
    if (destroyOnError) {
      await destroyDataSourceYearDb(dataSource, year);
    }
    process.exit(1);
  }
};

const putFeature = ({ dataSource, year, feature }) =>
  putFeatures({ dataSource, year, features: feature });

async function* makeFeatureAsyncIterator(dataSource, year, opts) {
  const db = await getDataSourceYearDb(dataSource, year);

  for await (const feature of db.createValueStream(opts)) {
    yield feature;
  }
}

module.exports = {
  putFeatures,
  putFeature,
  makeFeatureAsyncIterator,
  getDataSources,
  getDataSourceYears,
  destroyDataSourceYearDb,
  destroyDataSourceDb,
  destroy
};
