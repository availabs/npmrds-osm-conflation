#!/usr/bin/env node

const service = require('./');

// const d = service.getShstReferencesChainForTargetMapMatch(
// 'npmrds_2017',
// '104+10671'
// );

const iterator = service.makeShStReferenceFeatureIterator();

for (const feature of iterator) {
  console.log(JSON.stringify(feature, null, 4));
}
