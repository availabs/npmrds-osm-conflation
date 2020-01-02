const SharedStreetsMatchesAsyncIterator = require('../SharedStreetsMatchesAsyncIterator');
const MatchedFeaturesProcessor = require('../MatchedFeaturesProcessor');

const generalShstMatchFlags = [
  '--follow-line-direction',
];

const SHST_MATCH_BATCH_SIZE = 64;

const matchedFeaturesProcessor = new MatchedFeaturesProcessor(true);

class NpmrdsSharedStreetsMatchesAsyncIterator extends SharedStreetsMatchesAsyncIterator {
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

module.exports = NpmrdsSharedStreetsMatchesAsyncIterator;
