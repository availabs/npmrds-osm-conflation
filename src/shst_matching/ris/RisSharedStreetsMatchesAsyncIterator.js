const SharedStreetsMatchesAsyncIterator = require('../SharedStreetsMatchesAsyncIterator');
const MatchedFeaturesProcessor = require('../MatchedFeaturesProcessor');

const generalShstMatchFlags = [];

const SHST_MATCH_BATCH_SIZE = 64;

const matchedFeaturesProcessor = new MatchedFeaturesProcessor(false);

class RisSharedStreetsMatchesAsyncIterator extends SharedStreetsMatchesAsyncIterator {
  constructor(
    targetMapFeaturesIterator,
    shstMatchBatchSize = SHST_MATCH_BATCH_SIZE
  ) {
    super({
      generalShstMatchFlags,
      matchedFeaturesProcessor,
      targetMapFeaturesIterator,
      shstMatchBatchSize
    });
  }
}

module.exports = RisSharedStreetsMatchesAsyncIterator;
