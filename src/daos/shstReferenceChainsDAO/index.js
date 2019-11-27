/* eslint no-restricted-syntax: 0 */

const shstTilesetLevelDbService = require('../../services/shstTilesetLevelDbService');
const shstMatchesLevelDbService = require('../../services/shstMatchesLevelDbService');

async function* makeShStReferenceChainsForMatchesAsyncIterator(
  targetMapLevelDbService,
  opts
) {
  try {
    const iterator = targetMapLevelDbService.makeFeatureAsyncIterator(opts);

    for await (const feature of iterator) {
      const { id } = feature;

      const matchesByTargetMapForShStReference = await shstMatchesLevelDbService.getMatchesByTargetMapForShStReference(
        id
      );

      const shstMatchesByTargetMap = matchesByTargetMapForShStReference || null;

      yield {
        shstReferenceFeature,
        shstMatchesByTargetMap
      };
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

module.exports = {
  makeShStReferenceChainsForMatchesAsyncIterator
};
