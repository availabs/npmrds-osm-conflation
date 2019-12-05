#!/usr/bin/env node

/* eslint no-restricted-syntax: 0 */

const { mkdirSync } = require('fs');
const { join } = require('path');

const _ = require('lodash');

const Database = require('better-sqlite3');

const getGeoProximityKeyPrefix = require('../../utils/getGeoProximityKeyPrefix');

const SQLITE_PATH = join(__dirname, '../../../data/sqlite/');

const TARGET_MAPS_SQLITE_PATH = join(SQLITE_PATH, 'target_maps');

mkdirSync(SQLITE_PATH, { recursive: true });

const db = new Database(TARGET_MAPS_SQLITE_PATH);

const createTargetMapTable = targetMap => {
  db.exec(`
    BEGIN;

    CREATE TABLE IF NOT EXISTS ${targetMap} (
      id           TEXT PRIMARY KEY,
      geoprox_key  TEXT NOT NULL,
      feature      TEXT NOT NULL --JSON
    ) WITHOUT ROWID;

    CREATE INDEX IF NOT EXISTS ${targetMap}_geoprox_idx
      ON ${targetMap}(geoprox_key);

    COMMIT ;`);
};

const targetMapsListQuery = db.prepare(`
  SELECT name
    FROM sqlite_master
    WHERE type = 'table'
    ORDER BY name ;
`);

const getTargetMapsList = () => {
  const result = targetMapsListQuery.raw().all();

  return result.map(([name]) => name);
};

// Prepared statement for INSERTs
const featureInputStatementsByTargetMap = {};

const getFeatureInputStatementForTargetMap = targetMap => {
  const featureInputStatement = featureInputStatementsByTargetMap[targetMap];

  if (featureInputStatement) {
    return featureInputStatement;
  }

  createTargetMapTable(targetMap);

  featureInputStatementsByTargetMap[targetMap] = db.prepare(`
    INSERT INTO ${targetMap} (
      id,
      geoprox_key,
      feature
    ) VALUES(?, ?, ?);

  `);

  return featureInputStatementsByTargetMap[targetMap];
};

// INSERT the shst geometry
const insertFeatures = (targetMap, features) => {
  if (!features) {
    return;
  }

  const featuresArr = Array.isArray(features)
    ? features.filter(_.negate(_.isNil))
    : [features];

  if (!featuresArr.length) {
    return;
  }

  const featureInputStatement = getFeatureInputStatementForTargetMap(targetMap);

  for (let i = 0; i < featuresArr.length; i++) {
    const feature = featuresArr[i];

    const { id } = feature;

    const geoProximityKeyPrefix = getGeoProximityKeyPrefix(feature);
    const geoproxKey = `${geoProximityKeyPrefix}##${id}`;

    try {
      featureInputStatement.run([id, geoproxKey, JSON.stringify(feature)]);
    } catch (err) {
      // console.error(err)
    }
  }
};

const targetMapFeatureIteratorQueriesByTargetMap = {};
const getFeatureIteratorQueriesByTargetMap = targetMap => {
  const iteratorQuery = targetMapFeatureIteratorQueriesByTargetMap[targetMap];

  if (iteratorQuery) {
    return iteratorQuery;
  }

  targetMapFeatureIteratorQueriesByTargetMap[targetMap] = db.prepare(`
    SELECT feature FROM ${targetMap};
  `);

  return targetMapFeatureIteratorQueriesByTargetMap[targetMap];
};

function* makeFeatureIterator(targetMap) {
  const iteratorQuery = getFeatureIteratorQueriesByTargetMap(targetMap);

  const iterator = iteratorQuery.raw().iterate();

  for (const [strFeature] of iterator) {
    const feature = JSON.parse(strFeature);
    yield feature;
  }
}

const targetMapGeoProximityFeatureIteratorQueriesByTargetMap = {};
const getGeoProximityFeatureIteratorQueriesByTargetMap = targetMap => {
  const iteratorQuery =
    targetMapGeoProximityFeatureIteratorQueriesByTargetMap[targetMap];

  if (iteratorQuery) {
    return iteratorQuery;
  }

  targetMapGeoProximityFeatureIteratorQueriesByTargetMap[
    targetMap
  ] = db.prepare(`
    SELECT
        feature
      FROM ${targetMap}
      ORDER BY geoprox_key;
  `);

  return targetMapGeoProximityFeatureIteratorQueriesByTargetMap[targetMap];
};

function* makeGeoProximityFeatureIterator(targetMap) {
  const iteratorQuery = getGeoProximityFeatureIteratorQueriesByTargetMap(
    targetMap
  );

  const iterator = iteratorQuery.raw().iterate();

  for (const [strFeature] of iterator) {
    const feature = JSON.parse(strFeature);
    yield feature;
  }
}

const featureQueriesByTargetMap = {};
const getFeatureQueryForTargetMap = targetMap => {
  const query = featureQueriesByTargetMap[targetMap];

  if (query) {
    return query;
  }

  featureQueriesByTargetMap[targetMap] = db.prepare(`
    SELECT feature
      FROM ${targetMap}
      WHERE (id = ?) ;
  `);

  return featureQueriesByTargetMap[targetMap];
};

const getFeature = (targetMap, id) => {
  const query = getFeatureQueryForTargetMap(targetMap);

  const [strFeature] = query.raw().get(id);

  if (!strFeature) {
    return null;
  }

  const feature = JSON.parse(strFeature);

  return feature;
};

module.exports = {
  getTargetMapsList,
  insertFeatures,
  makeFeatureIterator,
  makeGeoProximityFeatureIterator,
  getFeature
};
