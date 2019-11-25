#!/usr/bin/env node

/* eslint no-restricted-syntax: 0 */

const { mkdirSync } = require('fs');
const { join } = require('path');

const levelup = require('levelup');
const leveldown = require('leveldown');
const encode = require('encoding-down');

const LEVELDB_DIR = join(__dirname, '../../../data/leveldb/');

const JSON_ENCODING = { valueEncoding: 'json' };

const CONFLATION_MAP_LEVELDB_DIR = join(LEVELDB_DIR, 'conflation_map');

const getLevelDbDir = () => CONFLATION_MAP_LEVELDB_DIR;

mkdirSync(getLevelDbDir(), { recursive: true });

const db = levelup(
  encode(leveldown(CONFLATION_MAP_LEVELDB_DIR), JSON_ENCODING)
);

const getKey = ({ id }) => id;

const makeBatchPutOperation = feature => ({
  type: 'put',
  key: getKey(feature),
  value: feature
});

const putFeatures = async features => {
  if (!features) {
    throw Error('features parameter is required');
  }

  const ops = Array.isArray(features)
    ? features.map(makeBatchPutOperation)
    : [makeBatchPutOperation(features)];

  console.error(JSON.stringify(features[0], null, 4));
  // console.error(JSON.stringify(ops, null, 4));
  try {
    await db.batch(ops);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

const putFeature = ({ feature }) => putFeatures({ features: feature });

async function* makeFeatureAsyncIterator(opts) {
  for await (const feature of db.createValueStream(opts)) {
    yield feature;
  }
}
module.exports = {
  putFeatures,
  putFeature,
  makeFeatureAsyncIterator
};
