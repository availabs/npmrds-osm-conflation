/* eslint no-restricted-syntax: 0, no-continue: 0 */

const _ = require('lodash');

const shstMatchesSQLiteService = require('../../services/shstMatchesSQLiteService');
const conflationMapSQLiteService = require('../../services/conflationMapSQLiteService');

const splitSegsComparator = (a, b) => {
  const aIdx = +a.split('|')[1];
  const bIdx = +b.split('|')[1];

  return aIdx - bIdx;
};

const targetMap = 'ris_2019';

try {
  const iterator = conflationMapSQLiteService.makeConflationMapIdsGroupedByTargetMapSegmentsIterator(
    targetMap
  );

  for (const { targetMapId, conflationMapIds } of iterator) {
    console.error('='.repeat(25));
    const chains = shstMatchesSQLiteService.getShstReferenceChains(
      targetMap,
      targetMapId
    );

    if (!chains) {
      continue;
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

    console.error(
      JSON.stringify({ conflationMapIds, conflationMapSegChains }, null, 4)
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
      targetMapSegIndexes,
      targetMapId
    );
  }
} catch (err) {
  console.error(err);
  process.exit(1);
}
