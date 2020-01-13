/* eslint no-restricted-syntax: 0, no-await-in-loop: 0 */

const loadMatchesForTargetMap = async (
  dbService,
  shstMatchesAsyncIterator,
  config
) => {
  const { maxIterations = Infinity } = config;

  let iteration = 0;
  let progress = true;

  while (progress && iteration++ < maxIterations) {
    progress = false;

    for await (const { shstMatchedFeatures } of shstMatchesAsyncIterator) {
      if (Array.isArray(shstMatchedFeatures) && shstMatchedFeatures.length) {
        // progress = true;

        for (let i = 0; i < shstMatchedFeatures.length; ++i) {
          const shstMatchedFeature = shstMatchedFeatures[i];

          shstMatchedFeature.properties.matchIterationId = iteration;

          try {
            dbService.insertMatchedFeature(shstMatchedFeature);
          } catch (err) {
            console.error(err);
          }
        }
      }
    }
  }
};

module.exports = loadMatchesForTargetMap;
