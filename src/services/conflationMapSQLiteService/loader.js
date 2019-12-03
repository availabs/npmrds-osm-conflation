#!/usr/bin/env node

/* eslint no-restricted-syntax: 0 */

const conflationMapLevelDbService = require('../conflationMapLevelDbService');
const conflationMapSQLiteService = require('./index');

(async () => {
  const levelDbAsyncIterator = conflationMapLevelDbService.makeFeatureAsyncIterator();

  for await (const feature of levelDbAsyncIterator) {
    conflationMapSQLiteService.insertConflationMapFeatures(feature);
  }
})();
