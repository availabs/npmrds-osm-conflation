/* eslint no-restricted-syntax: 0 */

const shstTilesetSQLiteService = require('../../services/shstTilesetSQLiteService');
const shstMatchesSQLiteService = require('../../services/shstMatchesSQLiteService');

function* makeShStReferenceFeatureWithMatchesAsyncIterator() {
  try {
    const iterator = shstTilesetSQLiteService.makeShStReferenceFeatureIterator();

    for (const shstReferenceFeature of iterator) {
      const { id } = shstReferenceFeature;

      const matchesByTargetMapForShStReference = shstMatchesSQLiteService.getMatchesByTargetMapForShStReference(
        id
      );

      const shstMatchesByTargetMap = matchesByTargetMapForShStReference || null;

      // if (!_.isEmpty(shstMatchesByTargetMap)) {
      // console.log('vvvvvvvvvvvvvvvvvvvvv');
      // console.log(id);
      // console.error(JSON.stringify(shstMatchesByTargetMap, null, 4));
      // console.log('^^^^^^^^^^^^^^^^^^^^^');
      // }
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
