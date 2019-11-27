#!/usr/bin/env node

/* eslint no-restricted-syntax: 0, no-await-in-loop: 0 */

const { readdirSync, mkdirSync } = require('fs');
const { dirname, join } = require('path');

const { sync: rimrafSync } = require('rimraf');
const _ = require('lodash');

const levelup = require('levelup');
const leveldown = require('leveldown');
const encode = require('encoding-down');
const sub = require('subleveldown');
const AutoIndex = require('level-auto-index');

const AggregatedShstReferenceMatchesAsyncIterator = require('./AggregatedShstReferenceMatchesAsyncIterator');
const ShstReferenceChainsForTargetMapMatchesAsyncIterator = require('./ShstReferenceChainsForTargetMapMatchesAsyncIterator');

const {
  getFeatureId,
  getIteratorQueryForFeatureId,
  getIteratorQueryForTargetMapId,
  validateTargetMapParam
} = require('./utils');

const LEVELDB_DIR = join(__dirname, '../../../data/leveldb/');

const JSON_ENCODING = { valueEncoding: 'json' };

const SHST_MATCHES_LEVELDB_DIR = join(LEVELDB_DIR, 'shst_matches');

mkdirSync(SHST_MATCHES_LEVELDB_DIR, { recursive: true });

const dbsByTargetMap = {};

const getTargetMapLevelDbDir = targetMap =>
  validateTargetMapParam(targetMap) &&
  join(SHST_MATCHES_LEVELDB_DIR, targetMap);

const getTargetMaps = () => Object.keys(dbsByTargetMap).sort();

// This function MUST be called for every targetMap database,
//   even those already existing on disk.
//   It is REQUIRED to set up secondary indexes' runtime behavior.
const initializeTargetMapDb = targetMap => {
  validateTargetMapParam(targetMap);

  let db = _.get(dbsByTargetMap, [targetMap], null);

  // Guarantee idempotency within process
  if (db) {
    return db;
  }

  const dir = getTargetMapLevelDbDir(targetMap);

  mkdirSync(dirname(dir), { recursive: true });

  db = levelup(encode(leveldown(dir), JSON_ENCODING));

  const targetMapDataSubDb = sub(db, 'data', JSON_ENCODING);

  const byTargetMapIdSubDb = sub(db, 'by_targetmap_id_idx', JSON_ENCODING);

  // set up automatic secondary indexing
  targetMapDataSubDb.byTargetMapId = AutoIndex(
    targetMapDataSubDb,
    byTargetMapIdSubDb,
    feature => {
      const {
        properties: {
          targetMapId,
          shstReferenceId,
          shstFromIntersectionId,
          shstToIntersectionId
        }
      } = feature;

      return `${targetMapId}##${shstReferenceId}##${shstFromIntersectionId}##${shstToIntersectionId}`;
    }
  );

  dbsByTargetMap[targetMap] = targetMapDataSubDb;

  return db;
};

_(readdirSync(SHST_MATCHES_LEVELDB_DIR, { withFileTypes: true }))
  .filter(
    dirent => dirent.isDirectory() && /^[A-Z0-9_]{1,}$/i.test(dirent.name)
  )
  .map('name')
  .forEach(targetMap => {
    initializeTargetMapDb(targetMap);
  });

const getTargetMapDb = (targetMap, create) => {
  validateTargetMapParam(targetMap);

  const db = dbsByTargetMap[targetMap];

  if (db) {
    return db;
  }

  if (create) {
    return initializeTargetMapDb(targetMap);
  }

  throw new Error(`ERROR: ${targetMap} shstMatches database does not exist`);
};

const getMatchFeatureTargetMap = matchFeature =>
  _.get(matchFeature, ['properties', 'targetMap']);

const validateMatchFeatures = matchFeatures => {
  if (!matchFeatures) {
    throw new Error('ERROR: empty matchFeatures parameter');
  }

  if (!Array.isArray(matchFeatures)) {
    throw new Error('ERROR: validateMatchFeatures takes an array of features.');
  }

  if (matchFeatures.length === 0) {
    return;
  }

  const targetMap = getMatchFeatureTargetMap(_.first(matchFeatures));

  if (!targetMap) {
    throw new Error('ERROR: match features MUST have a targetMap property.');
  }

  for (let i = 0; i < matchFeatures.length; ++i) {
    const feature = matchFeatures[i];

    const requiredProperties = [
      'targetMap',
      'targetMapId',
      'targetMapIsPrimary',
      'targetMapNetHrchyRank'
    ];

    if (
      _(feature.properties)
        .pick(requiredProperties)
        .some(_.isUndefined)
    ) {
      throw new Error(
        `ERROR: match features must have the following properties defined: ${requiredProperties}`
      );
    }

    if (feature.properties.targetMap !== targetMap) {
      throw new Error('ERROR: Batch puts must be for a single targetMap.');
    }
  }
};

const makeBatchPutOperation = feature => ({
  type: 'put',
  key: getFeatureId(feature),
  value: feature
});

const putFeatures = async (matchFeatures, destroyOnError = true) => {
  validateMatchFeatures(matchFeatures);

  if (!(matchFeatures && matchFeatures.length)) {
    return;
  }

  const matchFeaturesArr = Array.isArray(matchFeatures)
    ? matchFeatures
    : [matchFeatures];

  const ops = matchFeaturesArr.map(makeBatchPutOperation);

  // NOTE: validateMatchFeatures enforces targetMap consistency in
  const targetMap = getMatchFeatureTargetMap(_.first(matchFeaturesArr));
  const db = getTargetMapDb(targetMap, true);

  try {
    await db.batch(ops);
  } catch (err) {
    console.error(err);
    if (destroyOnError) {
      const dir = getTargetMapLevelDbDir(targetMap);
      rimrafSync(dir);
    }
    process.exit(1);
  }
};

const putFeature = feature => putFeatures(feature);

async function* makeTargetMapFeatureAsyncIterator(targetMap, opts) {
  const db = getTargetMapDb(targetMap);

  for await (const feature of db.createValueStream(opts)) {
    console.log(feature.id);
    yield feature;
  }
}

const getReadStreamsByTargetMap = opts =>
  getTargetMaps().reduce((acc, targetMap) => {
    const db = dbsByTargetMap[targetMap];
    const readStream = db.createReadStream(opts);

    acc[targetMap] = readStream;

    return acc;
  }, {});

function makeFeatureCollectionByTargetMapAsyncIterator(opts) {
  const readStreamsByTargetMap = getReadStreamsByTargetMap(opts);

  return new AggregatedShstReferenceMatchesAsyncIterator(
    readStreamsByTargetMap
  );
}

async function* makeAllMatchedFeaturesAsyncIterator() {
  const targetMaps = getTargetMaps();

  for (let i = 0; i < targetMaps.length; ++i) {
    const targetMap = targetMaps[i];

    const db = dbsByTargetMap[targetMap];
    const featureStream = db.createValueStream();

    for await (const feature of featureStream) {
      yield feature;
    }
  }
}

const makeShstReferenceChainsForTargetMapMatchesAsyncIterator = (
  targetMap,
  opts
) => {
  const db = dbsByTargetMap[targetMap];

  if (!db) {
    throw new Error('No matches database for targetMap', targetMap);
  }

  const valueStream = db.byTargetMapId.createValueStream(opts);

  return new ShstReferenceChainsForTargetMapMatchesAsyncIterator(valueStream);
};

const getMatchesByTargetMapForShStReference = async shstReferenceId => {
  try {
    const query = getIteratorQueryForFeatureId(shstReferenceId);
    console.error(JSON.stringify(query, null, 4));
    const iterator = makeFeatureCollectionByTargetMapAsyncIterator(query);

    let m = null;
    for await (const match of iterator) {
      console.log('MATCH');
      m = match;
    }

    return m;
  } catch (err) {
    console.error(err);
    throw err;
  }
};

const getShstReferencesChainForTargetMapId = async (targetMap, targetMapId) => {
  try {
    const query = getIteratorQueryForTargetMapId(targetMapId);
    const iterator = makeShstReferenceChainsForTargetMapMatchesAsyncIterator(
      targetMap,
      query
    );

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
  makeTargetMapFeatureAsyncIterator,
  makeFeatureCollectionByTargetMapAsyncIterator,
  makeShstReferenceChainsForTargetMapMatchesAsyncIterator,
  makeAllMatchedFeaturesAsyncIterator,
  getTargetMaps,
  getMatchesByTargetMapForShStReference,
  getShstReferencesChainForTargetMapId,
  dbsByTargetMap
};
