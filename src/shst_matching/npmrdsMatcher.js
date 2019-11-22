#!/usr/bin/env node

/* eslint no-restricted-syntax: 0, no-await-in-loop: 0 */

const { writeFileSync, readFileSync, renameSync, existsSync } = require('fs');
const { spawn } = require('child_process');
const { join } = require('path');

const _ = require('lodash');
const tmp = require('tmp');
const turfHelpers = require('@turf/helpers');

const npmrdsLevelDbService = require('../services/npmrdsLevelDbService');
const shstMatchesLevelDbService = require('../services/shstMatchesLevelDbService');

const PROJECT_ROOT = join(__dirname, '../../');
const DATA_DIR = join(PROJECT_ROOT, 'data/shst/');
const SHST_PATH = join(__dirname, '../../node_modules/.bin/shst');

const NPMRDS_DATA_SOURCE = 'npmrds';
const BATCH_SIZE = 512;
const UTF8_ENCODING = 'utf8';
const SHST_CHILD_PROC_OPTS = {
  cwd: PROJECT_ROOT,
  env: Object.assign({}, process.env, { HOME: DATA_DIR })
};

const INF_PATH = 'features.geojson';
const OUTF_PATH = 'shst_match_output.geojson';
const MATCHED_PATH = OUTF_PATH.replace(/geojson$/, 'matched.geojson');
const UNMATCHED_PATH = OUTF_PATH.replace(/geojson$/, 'unmatched.geojson');

const runMatcher = (inFilePath, outFilePath, flags) =>
  new Promise((resolve, reject) => {
    const cp = spawn(
      `${SHST_PATH}`,
      _.concat(
        [
          'match',
          `${inFilePath}`,
          '--follow-line-direction',
          '--snap-intersections',
          '--match-car',
          '--tile-hierarchy=8',
          `--out=${outFilePath}`
        ],
        flags
      ).filter(_.negate(_.isNil)),
      SHST_CHILD_PROC_OPTS
    );

    cp.on('error', () => {});
    cp.on('exit', code =>
      code === 0
        ? resolve()
        : reject(new Error('ERROR: shst match exited with nonzero code.'))
    );

    cp.stdout.pipe(process.stdout);
    cp.stderr.pipe(process.stderr);
  });

const runMotorwaysOnlyMatching = (inFilePath, outFilePath) =>
  runMatcher(inFilePath, outFilePath, '--match-motorway-only');

const runSurfaceStreetsOnlyMatching = (inFilePath, outFilePath) =>
  runMatcher(inFilePath, outFilePath, '--match-surface-streets-only');

// const runAllRoadsMatching = (inFilePath, outFilePath) =>
// runMatcher(inFilePath, outFilePath);

const collectMatches = matchedFilePath => {
  const matchedFeatures = [];

  const matched = existsSync(matchedFilePath)
    ? JSON.parse(readFileSync(matchedFilePath, UTF8_ENCODING))
    : null;

  const mFeatures =
    (matched && Array.isArray(matched.features) && matched.features) || [];

  for (let i = 0; i < mFeatures.length; ++i) {
    const { properties, geometry: { coordinates = null } = {} } = mFeatures[i];

    if (properties && coordinates) {
      matchedFeatures.push(
        turfHelpers.lineString(
          coordinates,
          // GeoJSON feature properties. We want only shst metadata and the necessary conflation metadata
          Object.assign({}, _.pickBy(properties, (v, k) => !k.match(/^pp_/)), {
            data_source_id: properties.pp_tmc,
            data_source_primary: properties.isprimary,
            data_source_net_hrchy: properties.f_system
          })
        )
      );
    }
  }

  return matchedFeatures;
};

const runMatcherForFeaturesBatch = async features => {
  const featureCollection = turfHelpers.featureCollection(features);
  const matchedFeatures = [];

  const { name: workDirName, removeCallback } = tmp.dirSync({
    unsafeCleanup: true
  });

  console.log(workDirName);
  const inFilePath = join(workDirName, INF_PATH);
  const outFilePath = join(workDirName, OUTF_PATH);

  const matchedFilePath = join(workDirName, MATCHED_PATH);
  const unmatchedFilePath = join(workDirName, UNMATCHED_PATH);

  writeFileSync(inFilePath, JSON.stringify(featureCollection));

  try {
    await runMotorwaysOnlyMatching(inFilePath, outFilePath);
    matchedFeatures.push(...collectMatches(matchedFilePath));
  } catch (err) {
    console.error(err);
  }

  if (existsSync(unmatchedFilePath)) {
    renameSync(unmatchedFilePath, inFilePath);

    try {
      await runSurfaceStreetsOnlyMatching(inFilePath, outFilePath);
      matchedFeatures.push(...collectMatches(matchedFilePath));
    } catch (err) {
      console.error(err);
    }
  }

  // if (existsSync(unmatchedFilePath)) {
  // renameSync(unmatchedFilePath, inFilePath);

  // try {
  // await runAllRoadsMatching(inFilePath, outFilePath);
  // matchedFeatures.push(...collectMatches(matchedFilePath));
  // } catch (err) {
  // console.error(err);
  // }
  // }

  removeCallback();

  return matchedFeatures;
};

const matchAndLoadBatch = async (year, batch) => {
  const matchedFeatures = await runMatcherForFeaturesBatch(batch);
  await shstMatchesLevelDbService.putFeatures({
    dataSource: NPMRDS_DATA_SOURCE,
    year,
    features: matchedFeatures
  });
};

const runMatcherForYear = async year => {
  const featuresIterator = npmrdsLevelDbService.makeGeoProximityFeatureAsyncIterator(
    year
    // { limit: 1123 }
  );

  const batch = [];

  for await (const feature of featuresIterator) {
    batch.push(feature);
    if (batch.length === BATCH_SIZE) {
      await matchAndLoadBatch(year, batch);
      batch.length = 0;
    }
  }
  if (batch.length) {
    await matchAndLoadBatch(year, batch);
  }
};

(async () => {
  try {
    const years = npmrdsLevelDbService.getDataYears();

    for (let i = 0; i < years.length; ++i) {
      await runMatcherForYear(years[i]);
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();