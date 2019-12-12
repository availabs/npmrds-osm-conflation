/* eslint no-restricted-syntax: 0, no-continue: 0 */

const _ = require('lodash');

const targetMapsSQLiteService = require('../../services/targetMapsSQLiteService');
const shstMatchesSQLiteService = require('../../services/shstMatchesSQLiteService');
const conflationMapSQLiteService = require('../../services/conflationMapSQLiteService');

const splitSegsComparator = (a, b) => {
  const aIdx = +a.properties.segmentIndex;
  const bIdx = +b.properties.segmentIndex;

  return aIdx - bIdx;
};

function initializeConflationMapSegIdxLookupTableForTargetMap(targetMap) {
  if (!targetMap) {
    throw new Error('targetMap parameter is required.');
  }

  const iterator = conflationMapSQLiteService.makeConflationMapIdsGroupedByTargetMapSegmentsIterator(
    targetMap
  );

  for (const { targetMapId, conflationMapFeatures } of iterator) {
    try {
      const { chains } = shstMatchesSQLiteService.getShstReferenceChains(
        targetMap,
        targetMapId
      );

      if (!chains || chains.length === 0) {
        console.log(
          JSON.stringify({
            msg: 'NO_CHAINS',
            targetMap,
            targetMapId
          })
        );
        continue;
      }

      if (chains.length > 2) {
        const pairwiseChains = [];

        // https://stackoverflow.com/a/43241295
        for (let i = 0; i < chains.length - 1; ++i) {
          for (let j = i + 1; j < chains.length; ++j) {
            const a = chains[i];
            const b = chains[j];

            if (_.intersection(a, b).length) {
              continue;
            }

            pairwiseChains.push([chains[i], chains[j]]);
          }
        }

        pairwiseChains.sort(
          (a, b) => _.flatten(b).length - _.flatten(a).length
        );

        chains.length = 0;
        chains.push(...pairwiseChains.slice(0, 2));
      } else if (chains.length === 2 && _.intersection(...chains).length > 0) {
        if (chains[0].length > chains[1].length) {
          chains.pop();
        } else {
          chains.shift();
        }
      }

      const conflationMapSegChains = chains.map(chain =>
        _.flatten(
          chain.map(shstReferenceId =>
            conflationMapFeatures
              .filter(
                ({ properties: { shstRefId } }) => shstRefId === shstReferenceId
              )
              .sort(splitSegsComparator)
              .map(({ id }) => id)
          )
        )
      );

      if (conflationMapSegChains.length === 2) {
        if (
          // If second contains first, remove first
          _.difference(conflationMapSegChains[0], conflationMapSegChains[1])
            .length === 0
        ) {
          conflationMapSegChains.splice(0, 1);
        } else if (
          // If first contains second, remove second
          _.difference(conflationMapSegChains[1], conflationMapSegChains[0])
            .length === 0
        ) {
          conflationMapSegChains.splice(1, 1);
        }
      }

      const targetMapSegIndexes = _.flatten(
        conflationMapSegChains.map(chain =>
          chain.map((conflationMapId, i) => ({
            conflationMapId,
            targetMapSegIdx: i
          }))
        )
      );

      conflationMapSQLiteService.insertConflationMapSegIndexesForTargetMapSegment(
        targetMap,
        targetMapSegIndexes
      );
    } catch (err) {
      // console.error(err);
      // process.exit(1);
    }
  }
}

function initializeConflationMapSegIdxLookupTables() {
  const targetMaps = targetMapsSQLiteService.getTargetMapsList();

  for (let i = 0; i < targetMaps.length; ++i) {
    const targetMap = targetMaps[i];

    initializeConflationMapSegIdxLookupTableForTargetMap(targetMap);
  }
}

module.exports = {
  initializeConflationMapSegIdxLookupTables
};
