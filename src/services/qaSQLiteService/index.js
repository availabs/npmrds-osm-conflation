#!/usr/bin/env node

/* eslint no-restricted-syntax: 0 */

const { mkdirSync, createWriteStream } = require('fs');
const { join } = require('path');

const _ = require('lodash');

const tmp = require('tmp');
const Database = require('better-sqlite3');
const turf = require('@turf/turf');

const LEN_DIFF_RATIO_THRESHOLD = 0.05;

const IN_MILES = {
  units: 'miles'
};

const SQLITE_PATH = join(__dirname, '../../../data/sqlite/');

const TARGET_MAPS_SQLITE_PATH = join(SQLITE_PATH, 'target_maps');
const CONFLATION_MAP_SQLITE_PATH = join(SQLITE_PATH, 'conflation_map');

const QA_OUTPUT_DIR = join(
  __dirname,
  '../../../',
  `qa_${_.round(Date.now() / 1000)}`
);

mkdirSync(QA_OUTPUT_DIR, { recurse: true });

const byFeatureWriteStream = createWriteStream(
  join(QA_OUTPUT_DIR, 'by_feature.csv')
);
byFeatureWriteStream.write(
  `target_map,id,target_map_len,conflation_map_len,length_diff_ratio\n`
);

const summaryWriteStream = createWriteStream(
  join(QA_OUTPUT_DIR, 'summaryWriteStream.csv')
);
summaryWriteStream.write(
  `target_map,total_target_map_miles,passing_diff_threshold,total_passing_miles,passing_ratio\n`
);

tmp.setGracefulCleanup();
const { name: tmpQADatabase } = tmp.fileSync();

const db = new Database(tmpQADatabase);

db.exec(`
  BEGIN;

  ATTACH DATABASE '${TARGET_MAPS_SQLITE_PATH}' AS target_maps;

  ATTACH DATABASE '${CONFLATION_MAP_SQLITE_PATH}' AS conflation_map;

  COMMIT ;
`);

const targetMaps = db
  .prepare(
    `
    SELECT name
      FROM target_maps.sqlite_master
      WHERE type = 'table'
      ORDER BY name ;
`
  )
  .raw()
  .all()
  .map(([name]) => name);

for (let i = 0; i < targetMaps.length; ++i) {
  const targetMap = targetMaps[i];

  const inOutLengths = {};

  const q1 = db.prepare(`
    SELECT
        feature
      FROM
        target_maps.${targetMap}
    `);

  const targetMapFeaturesIterator = q1.raw().iterate();

  for (const [strFeature] of targetMapFeaturesIterator) {
    const feature = JSON.parse(strFeature);
    const { id } = feature;
    const len = turf.length(feature, IN_MILES);
    inOutLengths[id] = [len, 0];
  }

  const q2 = db.prepare(`
    SELECT
        feature
      FROM conflation_map.conflation_map
    `);

  const conflationMapFeaturesIterator = q2.raw().iterate();

  for (const [strFeature] of conflationMapFeaturesIterator) {
    const feature = JSON.parse(strFeature);
    const {
      properties: { [targetMap]: id, osmMetadata: { oneWay = false } = {} }
    } = feature;

    if (!_.isNil(id)) {
      let len = turf.length(feature, IN_MILES);

      if (/^ris_\d{4}$/.test(targetMap) && !oneWay) {
        len /= 2;
      }
      inOutLengths[id][1] += len;
    }
  }

  let totalMiles = 0;
  let passingMiles = 0;

  Object.keys(inOutLengths).forEach(id => {
    const [inLen, outLen] = inOutLengths[id];
    totalMiles += inLen;
    const diff = inLen - outLen;
    const ratio = diff / inLen;

    if (Number.isFinite(ratio) && Math.abs(ratio) <= LEN_DIFF_RATIO_THRESHOLD) {
      passingMiles += inLen;
    }

    byFeatureWriteStream.write(
      `${targetMap},${id},${_.round(inLen, 3)},${_.round(outLen, 3)},${_.round(
        ratio,
        3
      )}\n`
    );
  });

  summaryWriteStream.write(
    `${targetMap},${_.round(totalMiles, 3)},${_.round(
      passingMiles,
      3
    )},${_.round(passingMiles / totalMiles, 3)}\n`
  );
}
