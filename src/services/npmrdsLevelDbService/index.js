#!/usr/bin/env node

// TODO: Prove that multiple calls to sub are idempotent.

/* eslint no-restricted-syntax: 0 */

const { mkdirSync } = require('fs');
const { promisify } = require('util');
const { join } = require('path');
const _ = require('lodash');
const rimraf = require('rimraf');

const rimrafAsync = promisify(rimraf);

const levelup = require('levelup');
const leveldown = require('leveldown');
const encode = require('encoding-down');
const sub = require('subleveldown');
const AutoIndex = require('level-auto-index');

const getGeoProximityKeyPrefix = require('../../utils/getGeoProximityKeyPrefix');

const LEVELDB_DIR =
  process.env.LEVELDB_DIR || join(__dirname, '../../../data/leveldb/');

const JSON_ENCODING = { valueEncoding: 'json' };

const NPMRDS_LEVELDB_DIR = join(LEVELDB_DIR, 'npmrds');

mkdirSync(LEVELDB_DIR, { recursive: true });

const validateYearParam = year => {
  if (!year) {
    throw new Error('year parameter is required.');
  }

  if (!Number.isSafeInteger(+year)) {
    throw new Error('year parameter must be an integer.');
  }
};

// Get or initialize the NPMRDS LevelDB.
let db;
const destroy = async () => {
  await rimrafAsync(NPMRDS_LEVELDB_DIR);
  db = null;
};

// This is to allow the destroy function.
const getNpmrdsDb = () => {
  if (db) {
    return db;
  }

  db = levelup(encode(leveldown(NPMRDS_LEVELDB_DIR), JSON_ENCODING));
  return db;
};

// Get or initialize the NPMRDS LevelDB metadata sublevel.
const getMetadataSubDb = () => sub(getNpmrdsDb(), 'metadata', JSON_ENCODING);

const getYearSubDb = year => {
  validateYearParam(year);
  return sub(getNpmrdsDb(), year, JSON_ENCODING);
};

const npmrdsDbsByYear = {};

const getNpmrdsDataYears = async () => {
  const metadataSubDb = getMetadataSubDb();

  // Add the yr to the metadata years property.
  try {
    // If this statement does not throw an error, the years property exists.
    const dataYears = await metadataSubDb.get('years');
    return dataYears;
  } catch (err) {
    const dataYears = [];

    await metadataSubDb.put('years', dataYears);
    return dataYears;
  }
};

const addYearToDbMetadata = async year => {
  validateYearParam(year);

  const dataYears = await getNpmrdsDataYears();

  const yr = +year;
  // If the data years does not include the yr, add it.
  if (!dataYears.includes(yr)) {
    const yrsSorted = _(dataYears)
      .push(yr)
      .sortBy(_.toSafeInteger)
      .value();

    const metadataSubDb = getMetadataSubDb();
    await metadataSubDb.put('years', yrsSorted);
  }
};

const getNpmrdsYearDb = async year => {
  validateYearParam(year);

  let yearDb = npmrdsDbsByYear[year];

  if (yearDb) {
    return yearDb;
  }

  // make sure typeof year is Integer
  addYearToDbMetadata(year);

  // initialize the database year sublevels
  yearDb = getYearSubDb(year);
  const data = sub(yearDb, 'data', JSON_ENCODING);

  // this sublevel holds the geoproximity secondary index that is
  // used to iterate over the npmrds features while preserving
  // the geographic proximity of iteration sequence neighbors.
  const geoProximityIdx = sub(yearDb, 'geoProximityIdx', JSON_ENCODING);

  // set up automatic secondary indexing
  data.byGeoProximityIdx = AutoIndex(data, geoProximityIdx, npmrdsFeature => {
    const {
      properties: { tmc },
      geometry: { coordinates }
    } = npmrdsFeature;

    const prefix = getGeoProximityKeyPrefix(coordinates);

    return `${prefix}::${tmc}`;
  });

  npmrdsDbsByYear[year] = data;

  return data;
};

const getPutOperation = feature => {
  const {
    properties: { tmc }
  } = feature;

  return { type: 'put', key: tmc, value: feature };
};

const putFeatures = async ({ year, features }) => {
  validateYearParam(year);

  if (!features) {
    return null;
  }

  const ops = Array.isArray(features)
    ? features.map(getPutOperation)
    : [getPutOperation(features)];

  const yearDb = await getNpmrdsYearDb(year);

  return yearDb.batch(ops);
};

const putFeature = ({ year, feature }) =>
  putFeatures({ year, features: feature });

async function* makeNpmrdsFeatureAsyncIterator(year, opts) {
  validateYearParam(year);

  const yearDb = await getNpmrdsYearDb(year);

  for await (const feature of yearDb.createValueStream(opts)) {
    yield feature;
  }
}

/**
 * Using the secondary index incurs a steep performance penalty.
 * If the geography proximity of iteration sequence neighbors is not necessary,
 *   use makeNpmrdsFeatureAsyncIterator.
 * This iterator generator exists to support microbatching calls to shst match.
 *   Outside of this use case, it probably is not necessary.
 */
async function* makeGeoProximityNpmrdsFeatureAsyncIterator(year, opts) {
  validateYearParam(year);

  const yearDb = await getNpmrdsYearDb(year);

  for await (const feature of yearDb.byGeoProximityIdx.createValueStream(opts)) {
    yield feature;
  }
}

// const removeYearFromDbMetadata = async year => {
// validateYearParam(year);

// const dataYears = await getNpmrdsDataYears();

// const yr = +year;
// // If the data years does not include the yr, add it.
// if (dataYears.includes(yr)) {
// const yrsSorted = _(dataYears)
// .remove(yr)
// .sortBy(_.toSafeInteger)
// .value();

// const metadataSubDb = getMetadataSubDb();
// await metadataSubDb.put('years', yrsSorted);
// }
// };

// const clearYear = async year => {
// await removeYearFromDbMetadata(year);

// const yearSubDb = getYearSubDb(year);
// await yearSubDb.clear();
// };

module.exports = {
  putFeatures,
  putFeature,
  makeNpmrdsFeatureAsyncIterator,
  makeGeoProximityNpmrdsFeatureAsyncIterator,
  getNpmrdsDataYears,
  destroy
};
