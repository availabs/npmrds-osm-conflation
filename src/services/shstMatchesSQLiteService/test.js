#!/usr/bin/env node

/* eslint no-restricted-syntax: 0 */

const service = require('./');

// const d = service.getShstReferencesChainForTargetMapMatch(
// 'npmrds_2017',
// '104+10671'
// );

// const d = service.getSetOfAllMatchedSementsForTargetMap('ris_2019');
// console.log(JSON.stringify([...d], null, 4));

const d = service.getMaxMatchedSegmentGeoProximityKeyForTargetMap('ris_2019');

console.log(d);
