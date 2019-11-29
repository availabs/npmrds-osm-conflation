#!/usr/bin/env node

const service = require('./');
const risLevelDbService = require('../risLevelDbService');

// const maxGeoProxKey = service.getMaxMatchedSegmentGeoProximityKeyForTargetMap(
// 'ris_2019'
// );

(async () => {
  const iterator = risLevelDbService.makeGeoProximityFeatureAsyncIterator(
    2019
    // {
    // gt: '1111110101110111110100011001001100001110100100'
    // }
    // {
    // gt: `${maxGeoProxKey}##`,
    // lt: `${maxGeoProxKey}##~`
    // }
  );

  for await (const feature of iterator) {
    console.log(feature.id);
  }
})();
