#!/usr/bin/env node

/* eslint no-restricted-syntax: 0 */

const dao = require('./');

const iterator = dao.makeShStReferenceFeatureWithMatchesAsyncIterator();

for (const d of iterator) {
  // console.error(JSON.stringify(d, null, 4));
}
