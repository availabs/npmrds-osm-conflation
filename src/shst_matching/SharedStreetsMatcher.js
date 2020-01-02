/* eslint no-restricted-syntax: 0, no-await-in-loop: 0 */

const { writeFileSync, readFileSync, existsSync } = require('fs');
const { spawn } = require('child_process');
const { join } = require('path');

const _ = require('lodash');
const tmp = require('tmp');
const turfHelpers = require('@turf/helpers');

const PROJECT_ROOT = join(__dirname, '../..');
const DATA_DIR = join(PROJECT_ROOT, 'data/shst/');
const SHST_PATH = join(__dirname, '../../node_modules/.bin/shst');

const UTF8_ENCODING = 'utf8';
const SHST_CHILD_PROC_OPTS = {
  cwd: PROJECT_ROOT,
  env: Object.assign({}, process.env, { HOME: DATA_DIR })
};

const INF_PATH = 'features.geojson';
const OUTF_PATH = 'shst_match_output.geojson';
const MATCHED_PATH = OUTF_PATH.replace(/geojson$/, 'matched.geojson');

const runShstMatch = (inFilePath, outFilePath, flags) => {
  console.log('FLAGS:', flags)
  return new Promise(resolve => {
    const cp = spawn(
      `${SHST_PATH}`,
      _.concat(
        [
          'match',
          `${inFilePath}`,
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
}
const collectMatchedFeatures = matchedFilePath => {
  const matchedFeatureCollection = existsSync(matchedFilePath)
    ? JSON.parse(readFileSync(matchedFilePath, UTF8_ENCODING))
    : null;

  const matchedFeatures = _.get(matchedFeatureCollection, 'features', []);

  return matchedFeatures.length ? matchedFeatures : null;
};

const shstMatchFeatures = async ({ features, flags }) => {
  if (!(Array.isArray(features) && features.length)) {
    return null;
  }
  const featureCollection = turfHelpers.featureCollection(features);

  const { name: workDirName, removeCallback: cleanup } = tmp.dirSync({
    unsafeCleanup: true
  });

  const inFilePath = join(workDirName, INF_PATH);
  const outFilePath = join(workDirName, OUTF_PATH);

  const matchedFilePath = join(workDirName, MATCHED_PATH);

  writeFileSync(inFilePath, JSON.stringify(featureCollection));

  try {
    await runShstMatch(inFilePath, outFilePath, flags);

    const matchedFeatures = collectMatchedFeatures(matchedFilePath);

    return matchedFeatures;
  } catch (err) {
    console.error(err);
    return null;
  } finally {
    cleanup();
  }
};

const runMotorwaysOnlyMatching = (features, flags) =>
  Array.isArray(features) && features.length
    ? shstMatchFeatures({
        features,
        flags: flags.concat(['--snap-intersections', '--match-motorway-only'])
      })
    : null;

const runSurfaceStreetsOnlyMatching = (features, flags) =>
  Array.isArray(features) && features.length
    ? shstMatchFeatures({
        features,
        flags: flags.concat([
          '--snap-intersections',
          '--match-surface-streets-only'
        ])
      })
    : null;

const getTargetMapFeatureIdFromMatchedFeature = ({
  properties: { pp_targetmapid }
}) => pp_targetmapid;

const getTargetMapFeatureId = ({ properties: { targetMapId } }) => targetMapId;

async function matchTargetMapFeatures(features, flags = []) {
  const matchedFeatures = [];
  const matchedIds = new Set();
  let unmatchedFeatures = features;

  let progress = true;

  const handleMatches = matches => {
    if (Array.isArray(matches) && matches.length) {
      progress = true;

      for (let i = 0; i < matches.length; ++i) {
        const match = matches[i];
        matchedFeatures.push(match);

        const targetMapId = getTargetMapFeatureIdFromMatchedFeature(match);
        matchedIds.add(targetMapId);
      }

      unmatchedFeatures = unmatchedFeatures.filter(
        feature => !matchedIds.has(getTargetMapFeatureId(feature))
      );
    }
  };

  while (progress) {
    progress = false;

    const matchedMotorways = await runMotorwaysOnlyMatching(
      unmatchedFeatures,
      flags
    );

    handleMatches(matchedMotorways);

    const matchedSurfaceStreets = await runSurfaceStreetsOnlyMatching(
      unmatchedFeatures,
      flags
    );

    handleMatches(matchedSurfaceStreets);
  }

  return matchedFeatures.length ? _.uniqWith(matchedFeatures, _.isEqual) : null;
}

module.exports = { matchTargetMapFeatures };
