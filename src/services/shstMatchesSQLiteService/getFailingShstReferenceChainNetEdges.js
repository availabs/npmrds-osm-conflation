#!/usr/bin/env node

/* eslint no-restricted-syntax: 0, no-continue: 0 */

const { join } = require('path');

const _ = require('lodash');

const Database = require('better-sqlite3');

const makeShstReferenceChains = require('./makeShstReferenceChains');

const SQLITE_PATH = join(__dirname, '../../../data/sqlite/');

const SHST_MATCHES_SQLITE_PATH = join(SQLITE_PATH, 'shst_matches');

const db = new Database(SHST_MATCHES_SQLITE_PATH);

const TARGET_MAP = 'ris_2019';

const targetMapIdsIteratorQuery = db.prepare(`
  SELECT DISTINCT
      target_map_id
    FROM shst_matches
    ORDER BY 1
`);

// Queries all the shst road network information for a matched target map segment.
//   Used to topologically sort the shstReferences for that matched target map segment.
const shstReferencesChainForTargetMapMatchQuery = db.prepare(`
  SELECT
      shst_reference_id,
      shst_from_intersection_id,
      shst_to_intersection_id
    FROM shst_matches
    WHERE (
      ( target_map = ? )
      AND
      ( target_map_id = ? )
    ) ;
`);

const targetMapIdsIterator = targetMapIdsIteratorQuery.raw().iterate();

let total = 0;
let passed = 0;
for (const [targetMapId] of targetMapIdsIterator) {
  // Returns the topologically sorted shstReferences for the given target map segment.
  const result = shstReferencesChainForTargetMapMatchQuery.all([
    TARGET_MAP,
    targetMapId
  ]);

  ++total;

  if (!result.length) {
    console.error('NO EDGES:', targetMapId);
    continue;
  }

  const shstNetEdges = result.map(row =>
    _.mapKeys(row, (v, k) => _.camelCase(k))
  );

  try {
    const chains = makeShstReferenceChains(shstNetEdges);
    if (chains) {
      ++passed;
      console.error('SUCCESS:', targetMapId);
    } else {
      console.log(JSON.stringify({ type: 'NULL_CHAIN', shstNetEdges }));
    }
  } catch (err) {
    console.error('FAIL:', targetMapId);
    console.log(JSON.stringify({ type: 'ERROR', shstNetEdges }));
  }
}

console.log(passed / total);
