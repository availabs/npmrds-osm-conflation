/* eslint no-restricted-syntax: 0, no-continue: 0 */

const _ = require('lodash');

const shstMatchesSQLiteService = require('../../services/shstMatchesSQLiteService');
const conflationMapSQLiteService = require('../../services/conflationMapSQLiteService');

const splitSegsComparator = (a, b) => {
  const aIdx = +a.split('|')[1];
  const bIdx = +b.split('|')[1];

  return aIdx - bIdx;
};

function initializeConflationMapSegIdxLookupTableForTargetMap(targetMap) {
  if (!targetMap) {
    throw new Error('targetMap parameter is required.');
  }

  const iterator = conflationMapSQLiteService.makeConflationMapIdsGroupedByTargetMapSegmentsIterator(
    targetMap
  );

  for (const { targetMapId, conflationMapIds } of iterator) {
    try {
      // console.error('='.repeat(25));
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
        console.log(
          JSON.stringify({
            msg: 'MORE_THAN_TWO_CHAINS',
            targetMap,
            targetMapId
          })
        );
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
        console.log(
          JSON.stringify({
            msg: 'INTERSECTING_CHAINS',
            targetMap,
            targetMapId
          })
        );

        if (chains[0].length > chains[1].length) {
          chains.pop();
        } else {
          chains.shift();
        }
      }

      const conflationMapSegChains = chains.map(chain =>
        _.flatten(
          chain.map(shstReferenceId =>
            conflationMapIds
              .filter(cmId => cmId.startsWith(shstReferenceId))
              .sort(splitSegsComparator)
          )
        )
      );

      // console.error(
      // JSON.stringify({ conflationMapIds, conflationMapSegChains }, null, 4)
      // );

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

module.exports = {
  initializeConflationMapSegIdxLookupTableForTargetMap
};
