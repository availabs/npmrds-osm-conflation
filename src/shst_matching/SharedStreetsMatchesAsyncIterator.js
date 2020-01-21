/* eslint no-restricted-syntax: 0, no-await-in-loop: 0 */

const _ = require('lodash');

const SharedStreetsMatcher = require('./SharedStreetsMatcher');

const SHST_MATCH_BATCH_SIZE = 64;

class SharedStreetsMatchesAsyncIterator {
  constructor({
    generalShstMatchFlags,
    matchedFeaturesProcessor,
    targetMapFeaturesIterator,
    shstMatchBatchSize = SHST_MATCH_BATCH_SIZE
  }) {
    this[
      Symbol.asyncIterator
    ] = async function* makeSharedStreetsMatchesAsyncIterator() {
      try {
        const unmatchedFeaturesQueue = [];

        const runShstMatchOnTargetMapFeatures = async () => {
          const shstMatchedFeatures = await SharedStreetsMatcher.matchTargetMapFeatures(
            unmatchedFeaturesQueue,
            generalShstMatchFlags
          );

          console.error(
            '=== MATCHED',
            Array.isArray(shstMatchedFeatures) ? shstMatchedFeatures.length : 0
          );

          // Process the matches
          const processedShstMatchResultsByTargetMapId = matchedFeaturesProcessor.handleShstMatchedFeatures(
            unmatchedFeaturesQueue,
            shstMatchedFeatures
          );

          const postprocessedMatchesCount =
            _(processedShstMatchResultsByTargetMapId)
              .values()
              .map('shstMatchedFeatures')
              .map('length')
              .sum() || 0;

          console.error('=== POSTPROCESSED', postprocessedMatchesCount);

          // Reset the queue
          unmatchedFeaturesQueue.length = 0;
          return processedShstMatchResultsByTargetMapId;
        };

        let matchBatchId = 0;
        let iteratorDone = false;

        while (!iteratorDone) {
          const {
            value: unmatchedTargetMapFeature,
            done
          } = targetMapFeaturesIterator.next();
          iteratorDone = done;

          if (!_.isNil(unmatchedTargetMapFeature)) {
            unmatchedFeaturesQueue.push(unmatchedTargetMapFeature);
          }

          if (
            unmatchedFeaturesQueue.length === shstMatchBatchSize ||
            (iteratorDone && !_.isEmpty(unmatchedFeaturesQueue))
          ) {
            console.log('matchBatchId:', matchBatchId);

            const processedShstMatchResultsByTargetMapId = await runShstMatchOnTargetMapFeatures();

            const matchedTargetMapIds = Object.keys(
              processedShstMatchResultsByTargetMapId
            );

            for (let i = 0; i < matchedTargetMapIds.length; ++i) {
              const targetMapId = matchedTargetMapIds[i];

              // { targetMapFeature, shstMatchedFeatures, shstMatchedFeaturesAreSorted }
              const processedShstMatchResult =
                processedShstMatchResultsByTargetMapId[targetMapId];

              const { shstMatchedFeatures } = processedShstMatchResult;

              if (Array.isArray(shstMatchedFeatures)) {
                for (let j = 0; j < shstMatchedFeatures.length; ++j) {
                  const shstMatchedFeature = shstMatchedFeatures[j];
                  shstMatchedFeature.properties.matchBatchId = matchBatchId;
                }
              }

              yield processedShstMatchResult;
            }

            ++matchBatchId;
          }
        }
      } catch (err) {
        console.error(err);
        throw err;
      }
    };
  }
}

module.exports = SharedStreetsMatchesAsyncIterator;
