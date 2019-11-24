#!/usr/bin/env node

/* eslint no-restricted-syntax: 0, no-await-in-loop: 0 */

const { writeFileSync, readFileSync, renameSync, existsSync } = require('fs');
const { spawn } = require('child_process');
const { join } = require('path');

const _ = require('lodash');
const tmp = require('tmp');
const turfHelpers = require('@turf/helpers');

const risLevelDbService = require('../services/risLevelDbService');
const shstMatchesLevelDbService = require('../services/shstMatchesLevelDbService');

const PROJECT_ROOT = join(__dirname, '../../');
const DATA_DIR = join(PROJECT_ROOT, 'data/shst/');
const SHST_PATH = join(__dirname, '../../node_modules/.bin/shst');

const RIS = 'ris';
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
  new Promise(resolve => {
    const cp = spawn(
      `${SHST_PATH}`,
      _.concat(
        [
          'match',
          `${inFilePath}`,
          '--snap-intersections',
          '--match-car',
          '--tile-hierarchy=8',
          `--out=${outFilePath}`
        ],
        flags
      ).filter(_.negate(_.isNil)),
      SHST_CHILD_PROC_OPTS
    );

    cp.on('error', err => {
      console.error(err);
    });

    cp.on('exit', code => {
      if (code !== 0) {
        console.error(`WARNING: shst match exited with code ${code}.`);
      }

      resolve();
    });

    cp.stdout.pipe(process.stdout);
    cp.stderr.pipe(process.stderr);
  });

const runMotorwaysOnlyMatching = (inFilePath, outFilePath) =>
  runMatcher(inFilePath, outFilePath, '--match-motorway-only');

const runSurfaceStreetsOnlyMatching = (inFilePath, outFilePath) =>
  runMatcher(inFilePath, outFilePath, '--match-surface-streets-only');

// const runAllRoadsMatching = (inFilePath, outFilePath) =>
// runMatcher(inFilePath, outFilePath);

const collectMatchedFeatures = matchedFilePath => {
  const matchedFeatureCollection = existsSync(matchedFilePath)
    ? JSON.parse(readFileSync(matchedFilePath, UTF8_ENCODING))
    : null;

  const matchedFeatures = _.get(matchedFeatureCollection, 'features', []);

  return matchedFeatures;
};

const runMatcherForFeaturesBatch = async features => {
  const featureCollection = turfHelpers.featureCollection(features);
  const matchedFeatures = [];

  const { name: workDirName, removeCallback } = tmp.dirSync({
    unsafeCleanup: true
  });

  const inFilePath = join(workDirName, INF_PATH);
  const outFilePath = join(workDirName, OUTF_PATH);

  const matchedFilePath = join(workDirName, MATCHED_PATH);
  const unmatchedFilePath = join(workDirName, UNMATCHED_PATH);

  writeFileSync(inFilePath, JSON.stringify(featureCollection));

  try {
    await runMotorwaysOnlyMatching(inFilePath, outFilePath);
    matchedFeatures.push(...collectMatchedFeatures(matchedFilePath));
  } catch (err) {
    console.error(err);
  }

  if (existsSync(unmatchedFilePath)) {
    renameSync(unmatchedFilePath, inFilePath);

    try {
      await runSurfaceStreetsOnlyMatching(inFilePath, outFilePath);
      matchedFeatures.push(...collectMatchedFeatures(matchedFilePath));
    } catch (err) {
      console.error(err);
    }
  }

  removeCallback();

  return matchedFeatures;
};

const matchAndLoadBatch = async (year, batch) => {
  const matchedFeatures = await runMatcherForFeaturesBatch(batch);

  for (let i = 0; i < matchedFeatures.length; ++i) {
    const matchedFeature = matchedFeatures[i];
    const { properties } = matchedFeature;

    // OBJECT MUTATION
    matchedFeature.properties = Object.assign(
      {},
      _.omitBy(properties, (v, k) => k.match(/^pp_/)),
      {
        targetMap: `${RIS}_${year}`,
        targetMapId: `${properties.pp_gis_id}##${properties.pp_beg_mp}`,
        targetMapIsPrimary: !(properties.pp_overlap_hierarchy > 1),
        targetMapNetHrchyRank: +properties.pp_functional_class % 10
      }
    );
  }

  await shstMatchesLevelDbService.putFeatures(matchedFeatures);
};

const runMatcherForYear = async year => {
  const featuresIterator = risLevelDbService.makeGeoProximityFeatureAsyncIterator(
    year
    // { limit: 256 }
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
    const years = await risLevelDbService.getDataYears();

    for (let i = 0; i < years.length; ++i) {
      await runMatcherForYear(years[i]);
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
