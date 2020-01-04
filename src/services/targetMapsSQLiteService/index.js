#!/usr/bin/env node

/* eslint no-restricted-syntax: 0 */

const { mkdirSync } = require('fs');
const { join } = require('path');

const _ = require('lodash');

const Database = require('better-sqlite3');

const getGeoProximityKey = require('../../utils/getGeoProximityKey');

// const SQLITE_PATH = join(__dirname, '../../../data/sqlite/');
const SQLITE_PATH = join(__dirname, '../../../tmpsqlite/');

const TARGET_MAPS_SQLITE_PATH = join(SQLITE_PATH, 'target_maps');

mkdirSync(SQLITE_PATH, { recursive: true });

const db = new Database(TARGET_MAPS_SQLITE_PATH);

const createTargetMapTable = targetMap => {
  db.exec(`
    BEGIN;

    CREATE TABLE IF NOT EXISTS ${targetMap} (
      id           TEXT PRIMARY KEY,
      region_code  TEXT,
      county_code  TEXT,
      geoprox_key  TEXT NOT NULL,
      feature      TEXT NOT NULL --JSON
    ) WITHOUT ROWID;

    CREATE INDEX IF NOT EXISTS ${targetMap}_iteration_order_idx
      ON ${targetMap}(region_code, county_code, geoprox_key);

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
      region_code,
      county_code,
      geoprox_key,
      feature
    ) VALUES(?, ?, ?, ?, ?);

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

    const {
      properties: { targetMapId, targetMapCountyCode, targetMapRegionCode }
    } = feature;

    const geoproxKey = getGeoProximityKey(feature);

    try {
      featureInputStatement.run([
        targetMapId,
        targetMapRegionCode,
        targetMapCountyCode,
        geoproxKey,
        JSON.stringify(feature)
      ]);
    } catch (err) {
      // console.error(err)
    }
  }
};

function* makeFeatureIterator(targetMap) {
  // FIXME: Remove county_code filter
  const iterator = db
    .prepare(
      `
    SELECT
        feature
      FROM ${targetMap}
WHERE (county_code = '36001')
      ORDER BY region_code, county_code, geoprox_key
-- LIMIT 128
    ;
  `
    )
    .raw()
    .iterate();

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

function* makeFeaturesGroupedByPropertyIterator(targetMap, prop) {
  const q = db.prepare(`
    SELECT
        JSON_EXTRACT(feature, '$.properties.${prop}'),
        GROUP_CONCAT(feature)  
      FROM ${targetMap}
      WHERE ( JSON_EXTRACT(feature, '$.properties.${prop}') IS NOT NULL )
      GROUP BY 1
      ORDER BY 1
  `);

  const iterator = q.raw().iterate();

  for (const [groupId, strFeatures] of iterator) {
    const features = JSON.parse(`[${strFeatures}]`);

    yield { [prop]: groupId, features };
  }
}

module.exports = {
  getTargetMapsList,
  insertFeatures,
  makeFeatureIterator,
  getFeature,
  makeFeaturesGroupedByPropertyIterator
};
