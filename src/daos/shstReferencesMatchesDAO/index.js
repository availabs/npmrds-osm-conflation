/* eslint no-restricted-syntax: 0 */

const shstTilesetLevelDbService = require('../../services/shstTilesetLevelDbService');
const shstMatchesLevelDbService = require('../../services/shstMatchesLevelDbService');

async function* makeShStReferenceFeatureWithMatchesAsyncIterator(opts) {
  try {
    const iterator = shstTilesetLevelDbService.makeShStReferenceFeatureAsyncIterator(
      opts
    );

    for await (const shstReferenceFeature of iterator) {
      const { id } = shstReferenceFeature;

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
  makeShStReferenceFeatureWithMatchesAsyncIterator
};
