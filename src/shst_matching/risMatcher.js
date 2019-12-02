#!/usr/bin/env node

/* eslint no-restricted-syntax: 0, no-await-in-loop: 0 */

const { writeFileSync, readFileSync, renameSync, existsSync } = require('fs');
const { spawn } = require('child_process');
const { join } = require('path');

const _ = require('lodash');
const tmp = require('tmp');
const turfHelpers = require('@turf/helpers');

const targetMapsSQLiteService = require('../services/targetMapsSQLiteService');
const shstMatchesSQLiteService = require('../services/shstMatchesSQLiteService');

const PROJECT_ROOT = join(__dirname, '../../');
const DATA_DIR = join(PROJECT_ROOT, 'data/shst/');
const SHST_PATH = join(__dirname, '../../node_modules/.bin/shst');

const BATCH_SIZE = 64;
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

    if (cp.stdout) {
      cp.stdout.pipe(process.stdout);
      cp.stderr.pipe(process.stderr);
    }
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
    try {
      renameSync(unmatchedFilePath, inFilePath);
      await runSurfaceStreetsOnlyMatching(inFilePath, outFilePath);
      matchedFeatures.push(...collectMatchedFeatures(matchedFilePath));
    } catch (err) {
      console.error(err);
    }
  }

  removeCallback();

  return matchedFeatures;
};

const matchFeatures = async (targetMap, batch) => {
  const matchedFeatures = await runMatcherForFeaturesBatch(batch);

  for (let i = 0; i < matchedFeatures.length; ++i) {
    const matchedFeature = matchedFeatures[i];
    const { properties } = matchedFeature;

    // OBJECT MUTATION
    matchedFeature.properties = Object.assign(
      {},
      _.omitBy(properties, (v, k) => k.match(/^pp_/)),
      {
        targetMap,
        targetMapId: `${properties.pp_gis_id}##${properties.pp_beg_mp}`,
        targetMapIsPrimary: !(properties.pp_overlap_hierarchy > 1),
        targetMapNetHrchyRank: +properties.pp_functional_class % 10
      }
    );
  }

  return matchedFeatures;
};

const runMatcherForYear = async targetMap => {
  const previousRunMatchedFeatures = shstMatchesSQLiteService.getSetOfAllMatchedSementsForTargetMap(
    targetMap
  );

  const featuresIterator = targetMapsSQLiteService.makeGeoProximityFeatureIterator(
    targetMap
  );

  const batch = [];

  let counter = 0;
  for (const feature of featuresIterator) {
    ++counter;
    if (!previousRunMatchedFeatures.has(feature.id)) {
      batch.push(feature);
    }

    if (batch.length === BATCH_SIZE) {
      console.log('counter:', counter);
      const matchedFeatures = await matchFeatures(targetMap, batch);

      shstMatchesSQLiteService.putFeatures(matchedFeatures);
      batch.length = 0;
    }
  }
  if (batch.length) {
    await matchFeatures(targetMap, batch);
  }
};

(async () => {
  try {
    const targetMaps = targetMapsSQLiteService.getTargetMapsList();

    const risTargetMaps = targetMaps.filter(targetMap =>
      /^ris_\d{4}$/.test(targetMap)
    );

    for (let i = 0; i < risTargetMaps.length; ++i) {
      const targetMap = risTargetMaps[i];
      await runMatcherForYear(targetMap);
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
