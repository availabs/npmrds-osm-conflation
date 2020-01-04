#!/usr/bin/env node

/* eslint no-restricted-syntax: 0 */

const service = require('./');

const iterator = service.makeConflationMapFeaturesGroupedByTargetMapMacroIdIterator(
  'ris_2019'
);

for (const { targetMapMacroId, conflationMapFeatures } of iterator) {
  console.log(
    JSON.stringify({ targetMapMacroId, conflationMapFeatures }, null, 4)
  );
}
