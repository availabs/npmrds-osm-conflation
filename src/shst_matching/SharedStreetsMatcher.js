/* eslint no-restricted-syntax: 0, no-await-in-loop: 0 */

const assert = require('assert');
const { writeFileSync, readFileSync, existsSync } = require('fs');
const { spawn } = require('child_process');
const { join, dirname } = require('path');

const { pipe, through } = require('mississippi');
const split = require('split2');

const _ = require('lodash');
const tmp = require('tmp');
const turf = require('@turf/turf');

const OSRM = require('osrm');
const memoizeOne = require('memoize-one');

const PROJECT_ROOT = join(__dirname, '../..');
const SHST_DATA_DIR = join(PROJECT_ROOT, 'data/shst/');
const SHST_PATH = join(__dirname, '../../node_modules/.bin/shst');

const UTF8_ENCODING = 'utf8';
const SHST_CHILD_PROC_OPTS = {
  cwd: PROJECT_ROOT,
  env: Object.assign({}, process.env, { HOME: SHST_DATA_DIR })
};

const SHST_DATA_DIR_REGEXP = new RegExp(
  `(${SHST_DATA_DIR.replace('.', '\n').replace('/', '\\/')}.*)`
);

const INF_PATH = 'features.geojson';
const OUTF_PATH = 'shst_match_output.geojson';
const MATCHED_PATH = OUTF_PATH.replace(/geojson$/, 'matched.geojson');

const runShstMatch = (inFilePath, outFilePath, flags) => {
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

    let osrmDir = null;

    pipe(
      cp.stdout,
      split(),
      through(function fn(line, $, cb) {
        console.log(line.toString());

        const pathMatch = line.toString().match(SHST_DATA_DIR_REGEXP);
        if (pathMatch) {
          const [osrmLocation] = pathMatch;

          osrmDir = dirname(osrmLocation);
        }

        cb();
      }),
      err => {
        if (err) {
          console.error(err);
        }
      }
    );

    pipe(
      cp.stderr,
      split(),
      through(function fn(line, $, cb) {
        console.error(line.toString());
        cb();
      }),
      err => {
        if (err) {
          console.error(err);
        }
      }
    );

    cp.on('error', err => {
      console.error(err);
    });

    cp.on('exit', code => {
      if (code !== 0) {
        console.error(`WARNING: shst match exited with code ${code}.`);
      }

      resolve(osrmDir);
    });
  });
};

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
  const featureCollection = turf.featureCollection(features);

  const { name: workDirName, removeCallback: cleanup } = tmp.dirSync({
    unsafeCleanup: true
  });

  const inFilePath = join(workDirName, INF_PATH);
  const outFilePath = join(workDirName, OUTF_PATH);

  const matchedFilePath = join(workDirName, MATCHED_PATH);

  writeFileSync(inFilePath, JSON.stringify(featureCollection));

  try {
    const osrmDir = await runShstMatch(inFilePath, outFilePath, flags);

    const matchedFeatures = collectMatchedFeatures(matchedFilePath);

    return { osrmDir, matchedFeatures };
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

const doubleLinestringPoints = feature => {
  const { features: explodedPoints } = turf.explode(feature);

  const [startLon, startLat] = _.flattenDeep(feature.geometry.coordinates);

  const enhancedCoords = explodedPoints.slice(1).reduce(
    (acc, pt, i) => {
      const prevPt = explodedPoints[i];

      const {
        geometry: { coordinates: midPtCoords }
      } = turf.midpoint(pt, prevPt);

      const {
        geometry: { coordinates: curPtCoords }
      } = pt;

      acc.push(midPtCoords);
      acc.push(curPtCoords);

      return acc;
    },
    [[startLon, startLat]]
  );

  try {
    return turf.lineString(enhancedCoords, feature.properties, {
      id: feature.id
    });
  } catch (err) {
    throw err;
  }
};

const getOSRM = memoizeOne(osrmDir => {
  const osrmFile = join(osrmDir, 'graph.xml.osrm');

  if (!existsSync(osrmFile)) {
    console.log('graph.xml.osrm file does not exist');
    return null;
  }

  try {
    return new OSRM(osrmFile);
  } catch (err) {
    console.error(err);
    return null;
  }
});

const replaceFeaturesGeomsWithOsrmRoute = (osrm, feature) =>
  new Promise((resolve, reject) => {
    const {
      geometry: { coordinates }
    } = feature;

    const chunkedCoords = _(coordinates)
      .flattenDeep()
      .chunk(2)
      .value();

    const osrmRouteCoords = [
      _.first(chunkedCoords),
      chunkedCoords[Math.ceil(chunkedCoords.length / 2)],
      _.last(chunkedCoords)
    ];

    osrm.route(
      {
        coordinates: osrmRouteCoords,
        geometries: 'geojson',
        continue_straight: true,
        overview: 'full',
        snapping: 'any'
      },
      (err, result) => {
        if (err) {
          return reject(err);
        }

        try {
          const { routes } = result;

          assert(routes.length === 1);

          const [
            {
              geometry: { coordinates: resultRouteCoords }
            }
          ] = routes;

          const newFeature = turf.lineString(
            // remove redundant points
            resultRouteCoords.filter(
              (coord, i) => !_.isEqual(coord, resultRouteCoords[i - 1])
            ),
            feature.properties,
            {
              id: feature.id
            }
          );

          return resolve(newFeature);
        } catch (err2) {
          console.error(err2);
          return resolve(null);
        }
      }
    );
  });

async function matchTargetMapFeatures(features, flags = []) {
  const matchedFeatures = [];
  const matchedIds = new Set();

  let unmatchedFeatures = features.filter(feature => {
    const {
      geometry: { coordinates }
    } = feature;

    return Array.isArray(coordinates) && coordinates.length;
  });

  let attempt = 0;

  let osrmDir = null;
  const handleMatches = async (matches, enhanceLinestrings) => {
    if (Array.isArray(matches) && matches.length) {
      for (let i = 0; i < matches.length; ++i) {
        const match = matches[i];
        matchedFeatures.push(match);

        const targetMapId = getTargetMapFeatureIdFromMatchedFeature(match);
        matchedIds.add(targetMapId);
      }
    }

    unmatchedFeatures = unmatchedFeatures.filter(
      feature => !matchedIds.has(getTargetMapFeatureId(feature))
    );

    if (attempt === 1) {
      unmatchedFeatures = unmatchedFeatures.map(feature =>
        doubleLinestringPoints(feature)
      );
    } else if (attempt === 2 && !enhanceLinestrings) {
      try {
        const osrm = getOSRM(osrmDir);

        if (unmatchedFeatures.length) {
          unmatchedFeatures = await Promise.all(
            unmatchedFeatures.map(async feature =>
              osrm
                ? (await replaceFeaturesGeomsWithOsrmRoute(osrm, feature)) ||
                  feature
                : feature
            )
          );
        }
      } catch (err) {
        console.error(err);
        process.exit(1);
      }
    }
  };

  while (unmatchedFeatures.length && attempt <= 3) {
    const {
      matchedFeatures: matchedMotorways
    } = await runMotorwaysOnlyMatching(unmatchedFeatures, flags);

    await handleMatches(matchedMotorways);

    const {
      matchedFeatures: matchedSurfaceStreets,
      osrmDir: curOsrmDir
    } = await runSurfaceStreetsOnlyMatching(unmatchedFeatures, flags);

    osrmDir = osrmDir || curOsrmDir;

    await handleMatches(matchedSurfaceStreets, true, osrmDir);

    ++attempt;
  }

  return matchedFeatures.length ? _.uniqWith(matchedFeatures, _.isEqual) : null;
}

module.exports = { matchTargetMapFeatures };
