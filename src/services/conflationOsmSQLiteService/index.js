#!/usr/bin/env node

/* eslint no-restricted-syntax: 0 */

const { join } = require('path');

const _ = require('lodash');

const Database = require('better-sqlite3');

// const SQLITE_PATH = join(__dirname, '../../../data/sqlite/');
const SQLITE_PATH = join(__dirname, '../../../tmpsqlite');

const RAW_OSM_SQLITE_PATH = join(SQLITE_PATH, 'conflation_osm');

const db = new Database(RAW_OSM_SQLITE_PATH);

// Initialize the database
db.exec(`
  BEGIN;

  CREATE TABLE IF NOT EXISTS nodes (
    id    INTEGER PRIMARY KEY,
    lon   REAL NOT NULL,
    lat   REAL NOT NULL
  ) WITHOUT ROWID;

  CREATE INDEX IF NOT EXISTS nodes_coords_idx 
    ON nodes(lon, lat);

  CREATE TABLE IF NOT EXISTS ways (
    id          INTEGER PRIMARY KEY,
    nodes       TEXT NOT NULL,
    raw_osm_id  INTEGER,
    start_node  INTEGER NOT NULL,
    end_node    INTEGER NOT NULL,
    tags        TEXT --JSON
  ) WITHOUT ROWID;

  CREATE INDEX IF NOT EXISTS ways_by_raw_osm_id_idx 
    ON ways(raw_osm_id);

  CREATE TABLE IF NOT EXISTS restrictions (
    id           INTEGER PRIMARY KEY,
    members      TEXT NOT NULL, --JSON
    restriction  TEXT
  ) WITHOUT ROWID;

  COMMIT;
`);

const nodeInputStatement = db.prepare(`
  INSERT INTO nodes (
    id,
    lon,
    lat
  ) VALUES(?, ?, ?);
`);

const insertNode = ({ id, lon, lat }) => {
  const longitude = _.round(+lon, 7);
  const latitude = _.round(+lat, 7);

  try {
    nodeInputStatement.run([id, longitude, latitude]);
  } catch (err) {
    // expect to encounter nodes multiple times
  }
};

const nodesIteratorQuery = db.prepare(`
  SELECT
      id,
      lon,
      lat
    FROM nodes;
`);

const makeNodesIterator = () => nodesIteratorQuery.iterate();

const wayInputStatement = db.prepare(`
  INSERT INTO ways (
    id,
    nodes,
    raw_osm_id,
    start_node,
    end_node,
    tags
  ) VALUES(?, ?, ?, ?, ?, ?);
`);

// INSERT the shst geometry
const insertWay = ({ id, rawOsmWayId, nodes, tags }) => {
  const startNode = _.first(nodes);
  const endNode = _.last(nodes);

  wayInputStatement.run([
    id,
    JSON.stringify(nodes),
    rawOsmWayId,
    startNode,
    endNode,
    JSON.stringify(tags)
  ]);
};

const waysIteratorQuery = db.prepare(`
  SELECT
      id,
      nodes,
      tags
    FROM ways;
`);

function* makeWaysIterator() {
  const iterator = waysIteratorQuery.iterate();

  for (const { id, nodes, tags } of iterator) {
    yield {
      id,
      nodes: _.isNil(nodes) ? null : JSON.parse(nodes),
      tags: _.isNil(tags) ? null : JSON.parse(tags)
    };
  }
}

const restrictionInputStatement = db.prepare(`
  INSERT INTO restrictions (
    id,
    members,
    restriction
  ) VALUES(?, ?, ?);
`);

// INSERT the shst geometry
const insertRestriction = ({ id, members, restriction }) => {
  restrictionInputStatement.run([id, JSON.stringify(members), restriction]);
};

const restrictionsIteratorQuery = db.prepare(`
  SELECT
      id,
      members,
      restriction
    FROM restrictions;
`);

function* makeRestrictionsIterator() {
  const iterator = restrictionsIteratorQuery.iterate();

  for (const { id, members, restriction } of iterator) {
    yield {
      id,
      members: _.isNil(members) ? null : JSON.parse(members),
      restriction
    };
  }
}

const selectNodeByCoordinatesQuery = db.prepare(`
  SELECT
      id
    FROM nodes
    WHERE (
      ( lon = ? )
      AND
      ( lat = ? )
    ) ;
`);

const getNodeIdByCoordinates = ({ lon, lat }) => {
  const longitude = _.round(+lon, 7);
  const latitude = _.round(+lat, 7);

  const [id = null] =
    selectNodeByCoordinatesQuery.raw().get([longitude, latitude]) || [];

  return id;
};

const getWayIdByStartNodeAndRawOsmWayIdQuery = db.prepare(`
  SELECT
      id
    FROM ways
    WHERE (
      ( raw_osm_id = ? )
      AND
      ( start_node = ? )
    ) ;
`);

const getWayIdByStartNodeAndRawOsmWayId = ({ rawOsmWayId, startNode }) => {
  const result = getWayIdByStartNodeAndRawOsmWayIdQuery.get([
    rawOsmWayId,
    startNode
  ]);

  return result ? result.id : null;
};

const getWayIdByEndNodeAndRawOsmWayIdQuery = db.prepare(`
  SELECT
      id
    FROM ways
    WHERE (
      ( raw_osm_id = ? )
      AND
      ( end_node = ? )
    ) ;
`);

const getWayIdByEndNodeAndRawOsmWayId = ({ rawOsmWayId, endNode }) => {
  const result = getWayIdByEndNodeAndRawOsmWayIdQuery.get([
    rawOsmWayId,
    endNode
  ]);

  return result ? result.id : null;
};

module.exports = {
  insertNode,
  makeNodesIterator,
  insertWay,
  makeWaysIterator,
  insertRestriction,
  makeRestrictionsIterator,
  getNodeIdByCoordinates,
  getWayIdByStartNodeAndRawOsmWayId,
  getWayIdByEndNodeAndRawOsmWayId
};
