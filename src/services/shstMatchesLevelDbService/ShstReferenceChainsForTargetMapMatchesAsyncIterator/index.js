/* eslint no-restricted-syntax: 0, no-await-in-loop: 0 */

// const assert = require('assert');
const _ = require('lodash');

// https://en.wikipedia.org/wiki/Topological_sorting#Kahn's_algorithm<Paste>
const createShstReferencesChain = features => {
  const byFromIntxnIds = features.reduce((acc, feature) => {
    const {
      properties: { shstFromIntersectionId }
    } = feature;
    if (acc[shstFromIntersectionId]) {
      throw new Error(
        'INVARIANT BROKEN: shstFromIntersectionId has more than one outbound edge.'
      );
    }

    acc[shstFromIntersectionId] = feature;
    return acc;
  }, {});

  const byToIntxnIds = features.reduce((acc, feature) => {
    const {
      properties: { shstToIntersectionId }
    } = feature;
    if (acc[shstToIntersectionId]) {
      console.error(JSON.stringify(_.map(features, 'properties'), null, 4));
      throw new Error(
        'INVARIANT BROKEN: shstToIntersectionId has more than one inbound edge.'
      );
    }

    acc[shstToIntersectionId] = feature;
    return acc;
  }, {});

  const sources = _.difference(
    Object.keys(byFromIntxnIds),
    Object.keys(byToIntxnIds)
  ).filter(e => e);

  if (sources.length > 1) {
    throw new Error(
      'INVARIANT BROKEN: currently only simple chains are supported.'
    );
  }

  const chain = [];
  let [source] = sources;

  while (true) {
    if (sources.length !== 1) {
      console.error(JSON.stringify(sources, null, 4));
    }

    const { properties: { shstReferenceId, shstToIntersectionId } = {} } =
      byFromIntxnIds[source] || {};

    if (shstReferenceId) {
      chain.push(shstReferenceId);
      source = shstToIntersectionId;
    } else {
      break;
    }
  }

  return chain;
};

class ShstReferenceChainsForTargetMapMatchesAsyncIterator {
  constructor(matchesByTargetMapIdValueStream) {
    let curTargetMapId;
    const accumulator = [];

    this[Symbol.asyncIterator] = async function* asyncIteratorFn() {
      for await (const feature of matchesByTargetMapIdValueStream) {
        const {
          properties: { targetMapId }
        } = feature;

        if (targetMapId !== curTargetMapId) {
          if (curTargetMapId) {
            if (curTargetMapId.localeCompare(targetMapId) >= 0) {
              console.log(curTargetMapId, targetMapId);
            }
            // assert(curTargetMapId.localeCompare(targetMapId) < 0);
            try {
              const chain = createShstReferencesChain(accumulator);
              yield { id: targetMapId, chain };
            } catch (err) {
              console.error(err);
            }
          }

          curTargetMapId = targetMapId;
          accumulator.length = 0;
        }

        accumulator.push(feature);
      }

      if (accumulator.length) {
        try {
          const chain = createShstReferencesChain(accumulator);
          yield chain;
        } catch (err) {
          console.error(err);
        }
      }
    };
  }
}

module.exports = ShstReferenceChainsForTargetMapMatchesAsyncIterator;
