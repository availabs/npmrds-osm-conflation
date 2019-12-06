#!/usr/bin/env node

/* eslint no-restricted-syntax: 0 */

const { join } = require('path');

const _ = require('lodash');

const Database = require('better-sqlite3');

const SQLITE_PATH = join(__dirname, '../../../data/sqlite/');

const RAW_OSM_SQLITE_PATH = join(SQLITE_PATH, 'raw_osm');

const db = new Database(RAW_OSM_SQLITE_PATH);

// Initialize the database
db.exec(`
  BEGIN;

  CREATE TABLE IF NOT EXISTS nodes (
    id    TEXT PRIMARY KEY,
    lon   REAL NOT NULL,
    lat   REAL NOT NULL,
    tags  TEXT --JSON
  ) WITHOUT ROWID;

  CREATE INDEX IF NOT EXISTS nodes_coords_idx 
    ON nodes(lon, lat);

  CREATE TABLE IF NOT EXISTS ways (
    id     INTEGER PRIMARY KEY,
    nodes  TEXT NOT NULL,
    tags   TEXT --JSON
  ) WITHOUT ROWID;

  CREATE TABLE IF NOT EXISTS restrictions (
    node_id      INTEGER NOT NULL,
    members      TEXT NOT NULL, --JSON
    restriction  TEXT
  );

  COMMIT;
`);

const nodeInputStatement = db.prepare(`
  INSERT INTO nodes (
    id,
    lon,
    lat,
    tags
  ) VALUES(?, ?, ?, ?);
`);

const insertNode = ({ id, lon, lat, tags }) => {
  nodeInputStatement.run([id, +lon, +lat, JSON.stringify(tags)]);
};

const wayInputStatement = db.prepare(`
  INSERT INTO ways (
    id,
    nodes,
    tags
  ) VALUES(?, ?, ?);
`);

// INSERT the shst geometry
const insertWay = ({ id, nodes, tags }) => {
  wayInputStatement.run([id, JSON.stringify(nodes), JSON.stringify(tags)]);
};

const getWayByIdQuery = db.prepare(`
  SELECT
      id,
      nodes,
      tags
    FROM ways
    WHERE ( id = ? ) ;
`);

const getWayById = id => {
  const result = getWayByIdQuery.get([id]);

  if (_.isNil(result)) {
    return null;
  }

  const { nodes, tags } = result;

  return {
    id,
    nodes: JSON.parse(nodes),
    tags: JSON.parse(tags)
  };
};

const restrictionInputStatement = db.prepare(`
  INSERT INTO restrictions (
    node_id,
    members,
    restriction
  ) VALUES(?, ?, ?);
`);

// INSERT the shst geometry
const insertRestriction = ({ nodeId, members, restriction }) => {
  restrictionInputStatement.run([nodeId, JSON.stringify(members), restriction]);
};

const makeRestrictionsIteratorQuery = db.prepare(`
  SELECT
      node_id,
      members,
      restriction
    FROM restrictions ;
`);

function* makeRestrictionsIterator() {
  const iterator = makeRestrictionsIteratorQuery.iterate();

  for (const { node_id: nodeId, members, restriction } of iterator) {
    if (members && restriction) {
      yield {
        nodeId,
        members: JSON.parse(members),
        restriction
      };
    }
  }
}

module.exports = {
  insertNode,
  insertWay,
  getWayById,
  insertRestriction,
  makeRestrictionsIterator
};
