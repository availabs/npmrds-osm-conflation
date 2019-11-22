#!/usr/bin/env node

/* eslint no-restricted-syntax: 0, no-await-in-loop: 0 */

const { readdirSync, mkdirSync } = require('fs');
const { dirname, join } = require('path');

const { sync: rimrafSync } = require('rimraf');
const _ = require('lodash');

const levelup = require('levelup');
const leveldown = require('leveldown');
const encode = require('encoding-down');

const AggregatedShstReferenceMatchesAsyncIterator = require('./AggregatedShstReferenceMatchesAsyncIterator');

const {
  getFeatureId,
  getIteratorQueryForFeatureId,
  validateYearParam,
  validateDataSourceParam
} = require('./utils');

const LEVELDB_DIR = join(__dirname, '../../../data/leveldb/');

const JSON_ENCODING = { valueEncoding: 'json' };

const SHST_MATCHES_LEVELDB_DIR = join(LEVELDB_DIR, 'shst_matches');

mkdirSync(SHST_MATCHES_LEVELDB_DIR, { recursive: true });

const dbsByDataSourceByYear = {};

const getDataSourceYearLevelDbDir = (dataSource, year) =>
  validateDataSourceParam(dataSource) &&
  validateYearParam(year) &&
  join(SHST_MATCHES_LEVELDB_DIR, dataSource, `${year}`);

const getDataSources = () => Object.keys(dbsByDataSourceByYear).sort();

const getYearsForDataSource = dataSource =>
  validateDataSourceParam(dataSource) &&
  Object.keys(_.get(dbsByDataSourceByYear, [dataSource], []))
    .sort()
    .map(_.toInteger);

const getDataSourceYearBreakdown = () =>
  getDataSources().reduce((acc, dataSource) => {
    acc[dataSource] = getYearsForDataSource(dataSource);
    return acc;
  }, {});

// This function MUST be called for every year database,
//   even those already existing on disk.
//   It is REQUIRED to set up runtime behavior.
const initializeDataSourceYearDb = (dataSource, year) => {
  validateDataSourceParam(dataSource);
  validateYearParam(year);

  let db = _.get(dbsByDataSourceByYear, [dataSource, year], null);

  // Guarantee idempotency within process
  if (db) {
    return db;
  }

  const dir = getDataSourceYearLevelDbDir(dataSource, year);

  mkdirSync(dirname(dir), { recursive: true });

  db = levelup(encode(leveldown(dir), JSON_ENCODING));

  dbsByDataSourceByYear[dataSource] = dbsByDataSourceByYear[dataSource] || {};
  dbsByDataSourceByYear[dataSource][year] = db;

  return db;
};

_(readdirSync(SHST_MATCHES_LEVELDB_DIR, { withFileTypes: true }))
  .filter(
    dirent => dirent.isDirectory() && /^[A-Z0-9_]{1,}$/i.test(dirent.name)
  )
  .map(({ name: dataSource }) => {
    const dataSourceDir = join(SHST_MATCHES_LEVELDB_DIR, dataSource);

    const dataSourceYears = readdirSync(dataSourceDir, {
      withFileTypes: true
    })
      .filter(dirent => dirent.isDirectory() && /^\d{4}$/.test(dirent.name))
      .map(({ name: year }) => +year);

    return dataSourceYears.map(year => ({ dataSource, year }));
  })
  .flatten()
  .forEach(({ dataSource, year }) => {
    initializeDataSourceYearDb(dataSource, year);
  });

const getDataSourceYearDb = (dataSource, year, create) => {
  validateDataSourceParam(dataSource);
  validateYearParam(year);

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

const putFeatures = async ({
  dataSource,
  year,
  features,
  destroyOnError = true
}) => {
  if (!features) {
    return;
  }

  const db = getDataSourceYearDb(dataSource, year, true);

  const ops = Array.isArray(features)
    ? features.map(makeBatchPutOperation)
    : [makeBatchPutOperation(features)];

  try {
    await db.batch(ops);
  } catch (err) {
    console.error(err);
    if (destroyOnError) {
      const dir = getDataSourceYearLevelDbDir(dataSource, year);
      rimrafSync(dir);
    }
    process.exit(1);
  }
};

const putFeature = ({ dataSource, year, feature }) =>
  putFeatures({ dataSource, year, features: feature });

async function* makeDataSourceYearFeatureAsyncIterator(dataSource, year, opts) {
  const db = getDataSourceYearDb(dataSource, year);

  for await (const feature of db.createValueStream(opts)) {
    yield feature;
  }
}

const getReadStreamsByDataSourceYear = opts =>
  getDataSources().reduce((acc, dataSource) => {
    const years = getYearsForDataSource(dataSource);
    for (let j = 0; j < years.length; ++j) {
      const year = years[j];

      const db = dbsByDataSourceByYear[dataSource][year];
      const readStream = db.createReadStream(opts);

      acc[dataSource] = acc[dataSource] || {};
      acc[dataSource][year] = readStream;
    }

    return acc;
  }, {});

function makeFeatureCollectionByDataSourceYearAsyncIterator(opts) {
  const readStreamsByDataSourceYear = getReadStreamsByDataSourceYear(opts);

  return new AggregatedShstReferenceMatchesAsyncIterator(
    readStreamsByDataSourceYear
  );
}

async function* makeAllMatchedFeaturesAsyncIterator() {
  const dataSources = getDataSources();

  for (let i = 0; i < dataSources.length; ++i) {
    const dataSource = dataSources[i];

    const years = getYearsForDataSource(dataSource);
    for (let j = 0; j < years.length; ++j) {
      const year = years[j];

      const db = dbsByDataSourceByYear[dataSource][year];
      const featureStream = db.createValueStream();

      for await (const feature of featureStream) {
        yield feature;
      }
    }
  }
}

const getMatchesByDataSourceYearForShStReference = async shstReferenceId => {
  try {
    const query = getIteratorQueryForFeatureId(shstReferenceId);
    const iterator = makeFeatureCollectionByDataSourceYearAsyncIterator(query);

    let m;
    for await (const match of iterator) {
      m = match;
    }

    return m;
  } catch (err) {
    console.error(err);
    throw err;
  }
};

module.exports = {
  putFeatures,
  putFeature,
  makeDataSourceYearFeatureAsyncIterator,
  makeFeatureCollectionByDataSourceYearAsyncIterator,
  makeAllMatchedFeaturesAsyncIterator,
  getDataSources,
  getYearsForDataSource,
  getDataSourceYearBreakdown,
  getMatchesByDataSourceYearForShStReference
};
