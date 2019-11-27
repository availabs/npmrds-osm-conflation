#!/usr/bin/env node

const service = require('./');

const { getIteratorQueryForFeatureId } = require('./utils');

// (async () => {
// const iterator = service.makeShstReferenceChainsForTargetMapMatchesAsyncIterator(
// 'npmrds_2017'
// );

// for await (const chain of iterator) {
// console.error(JSON.stringify(chain, null, 4));
// }
// })();

// (async () => {
// const chain = await service.getShstReferencesChainForTargetMapId(
// 'npmrds_2017',
// TMC
// );

// console.error(JSON.stringify({ TMC, chain }, null, 4));
// })();

(async () => {
  // const query = {
    // gt: '00003eaf4eee55e84e75160225e7f231',
    // lt: '00003eaf4eee55e84e75160225e7f231##~'
  // };

  const query = {
    "gt": "c155480196fc2d5766955f1fcbe7bac0",
    "lt": "c155480196fc2d5766955f1fcbe7bac0##~"
}

console.log(query)

  const db = service.dbsByTargetMap.npmrds_2017;

  // console.log(JSON.stringify(query));
  const iterator = db.createValueStream(query);

  for await (const key of iterator) {
    console.error(JSON.stringify(key, null, 4));
    process.exit();
  }
})();
