/* eslint no-restricted-syntax: 0, no-await-in-loop: 0 */

const _ = require('lodash');

const shstMatchFeatures = require('../shstMatchFeatures');

const SHST_MATCH_BATCH_SIZE = 128;
const UNDEFINED_FSYSTEM_RANK = 10;

const generalFlags = ['--follow-line-direction', '--snap-intersections'];

const runMotorwaysOnlyMatching = features =>
  shstMatchFeatures({
    features,
    flags: generalFlags.concat('--match-motorway-only')
  });

const runSurfaceStreetsOnlyMatching = features =>
  shstMatchFeatures({
    features,
    flags: generalFlags.concat('--match-surface-streets-only')
  });

const { getTargetMapFeatureId, getMatchedFeatureId } = require('./utils');

const isSomething = v => !(_.isNil(v) || v === '');

const runShstMatchForFeatures = async features => {
  const matchedFeatures = [];

  const matchedMotorways = await runMotorwaysOnlyMatching(features);

  if (Array.isArray(matchedMotorways) && matchedMotorways.length) {
    matchedFeatures.push(...matchedMotorways);
  }

  const matchedIds = new Set(matchedFeatures.map(getMatchedFeatureId));

  const unmatchedFeatures = features.filter(
    feature => !matchedIds.has(getTargetMapFeatureId(feature))
  );

  const matchedSurfaceStreets = await runSurfaceStreetsOnlyMatching(
    unmatchedFeatures
  );

  if (matchedSurfaceStreets) {
    matchedFeatures.push(...matchedSurfaceStreets);
  }

  return matchedFeatures.length ? matchedFeatures : null;
};

const matchNpmrdsFeatures = async (targetMap, features) => {
  const matchedFeatures = await runShstMatchForFeatures(features);

  if (!matchedFeatures) {
    return null;
  }

  for (let i = 0; i < matchedFeatures.length; ++i) {
    const matchedFeature = matchedFeatures[i];
    const { properties } = matchedFeature;

    // OBJECT MUTATION
    matchedFeature.properties = Object.assign(
      {},
      _.omitBy(properties, (v, k) => k.match(/^pp_/)),
      {
        targetMap,
        targetMapId: properties.pp_tmc,
        targetMapIsPrimary: isSomething(properties.pp_isprimary)
          ? !!+properties.pp_isprimary
          : true,
        targetMapNetHrchyRank: isSomething(properties.pp_f_system)
          ? +properties.pp_f_system
          : UNDEFINED_FSYSTEM_RANK
      }
    );
  }

  return matchedFeatures;
};

async function* makeNpmrdsShstMatchesAsyncIterator({
  targetMapFeaturesIterator,
  targetMap,
  shstMatchBatchSize = SHST_MATCH_BATCH_SIZE
}) {
  let subset = [];

  for (const targetMapFeature of targetMapFeaturesIterator) {
    subset.push(targetMapFeature);

    if (subset.length === shstMatchBatchSize) {
      const shstMatchedFeatures = await matchNpmrdsFeatures(targetMap, subset);

      const d = {
        // no defensive copy because this code is finished with current array
        targetMapFeatures: subset,
        shstMatchedFeatures
      };

      yield d;

      subset = [];
    }
  }

  if (subset.length) {
    const matchedFeatures = await matchNpmrdsFeatures(targetMap, subset);
    yield matchedFeatures;
  }
}

module.exports = makeNpmrdsShstMatchesAsyncIterator;
