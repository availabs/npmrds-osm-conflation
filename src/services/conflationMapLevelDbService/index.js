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

const makeBatchPutOperation = feature => ({
  type: 'put',
  key: feature.id,
  value: feature
});

const putFeatures = async ({ features }) => {
  if (!features) {
    return;
  }

  const ops = Array.isArray(features)
    ? features.map(makeBatchPutOperation)
    : [makeBatchPutOperation(features)];

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
