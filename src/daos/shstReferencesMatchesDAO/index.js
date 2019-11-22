/* eslint no-restricted-syntax: 0 */

const shstTilesetLevelDbService = require('../../services/shstTilesetLevelDbService');
const shstMatchesLevelDbService = require('../../services/shstMatchesLevelDbService');

async function* makeShStReferenceFeatureWithMatchesAsyncIterator(opts) {
  try {
    const iterator = shstTilesetLevelDbService.makeShStReferenceFeatureAsyncIterator(
      opts
    );

    for await (const feature of iterator) {
      const { id } = feature;

      const shst_matches = await shstMatchesLevelDbService.getMatchesByDataSourceYearForShStReference(
        id
      );

      feature.properties.shst_matches = shst_matches || null;

      yield feature;
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

module.exports = {
  makeShStReferenceFeatureWithMatchesAsyncIterator
};
