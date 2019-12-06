#!/usr/bin/env node

// Official SharedStreets Documentation: https://github.com/sharedstreets/sharedstreets-ref-system

/* eslint no-restricted-syntax: 0 */

const { join } = require('path');

const turfHelpers = require('@turf/helpers');
const _ = require('lodash');

const Database = require('better-sqlite3');

const ShStReferenceFeatureIterator = require('./ShStReferenceFeatureIterator');

const SQLITE_PATH = join(__dirname, '../../../data/sqlite/');

const SHST_TILESET_SQLITE_PATH = join(SQLITE_PATH, 'shst_tileset');

const db = new Database(SHST_TILESET_SQLITE_PATH);

// https://github.com/JoshuaWise/better-sqlite3/issues/125#issuecomment-386752196
// db.pragma('journal_mode = WAL');

// Initialize the database
db.exec(`
  BEGIN;

  CREATE TABLE IF NOT EXISTS shst_geometry (
    id                    TEXT PRIMARY KEY,
    forward_reference_id  TEXT,
    back_reference_id     TEXT,
    feature               TEXT NOT NULL --JSON
  ) WITHOUT ROWID;

  CREATE TABLE IF NOT EXISTS shst_metadata (
    geometry_id  TEXT PRIMARY KEY,
    metadata     TEXT NOT NULL --JSON
  ) WITHOUT ROWID;

  CREATE TABLE IF NOT EXISTS shst_reference (
    id           TEXT,
    geometry_id  TEXT NOT NULL,
    reference    TEXT NOT NULL --JSON
  );

  CREATE INDEX IF NOT EXISTS shst_reference_idx
    ON shst_reference(id);

  CREATE VIEW IF NOT EXISTS shst_geom_meta_join_view (
    geom_feature,
    metadata
  ) AS
    SELECT
        g.feature,
        m.metadata
      FROM shst_geometry AS g
        INNER JOIN shst_metadata AS m
          ON ( g.id == m.geometry_id )
  ;

  CREATE VIEW IF NOT EXISTS shst_ref_geom_meta_join_view (
    shst_reference_id,
    geom_feature,
    metadata,
    is_forward
  ) AS
    SELECT
        r.id,
        g.feature,
        m.metadata,
        r.id == g.forward_reference_id
      FROM shst_reference AS r
        INNER JOIN shst_geometry AS g
          ON ( r.geometry_id == g.id )
        INNER JOIN shst_metadata AS m
          ON ( g.id == m.geometry_id )
  ;

  COMMIT;
`);

// ========== Geometry ==========

// Prepared statement for shst geometry INSERTs
const shstGeometryInputStatement = db.prepare(`
  INSERT INTO shst_geometry (
    id,
    forward_reference_id,
    back_reference_id,
    feature
  ) VALUES(?, ?, ?, ?);
`);

// INSERT the shst geometry
const insertGeometries = geometries => {
  if (!geometries) {
    return;
  }

  const geomsArr = Array.isArray(geometries)
    ? geometries.filter(_.negate(_.isNil))
    : [geometries];

  if (!geomsArr.length) {
    return;
  }

  for (let i = 0; i < geomsArr.length; i++) {
    const geom = geomsArr[i];

    const { id, lonlats, forwardReferenceId, backReferenceId } = geom;

    const coords = _.chunk(lonlats, 2);

    const properties = {
      id,
      forwardReferenceId,
      backReferenceId
    };

    const feature = turfHelpers.lineString(coords, properties, { id });

    try {
      shstGeometryInputStatement.run(
        id,
        forwardReferenceId,
        backReferenceId,
        JSON.stringify(feature)
      );
    } catch (err) {
      // console.error(err)
    }
  }
};

// ========== Metadata ==========

// Prepared statement for shst metadata INSERTs
const shstMetadataInputStatement = db.prepare(`
  INSERT INTO shst_metadata (
    geometry_id,
    metadata
  ) VALUES(?, ?);
`);

// INSERT the shst metadata
const insertMetadata = metadata => {
  if (!metadata) {
    return;
  }

  const metadataArr = Array.isArray(metadata)
    ? metadata.filter(_.negate(_.isNil))
    : [metadata];

  if (!metadataArr.length) {
    return;
  }

  for (let i = 0; i < metadataArr.length; i++) {
    const meta = metadataArr[i];

    try {
      shstMetadataInputStatement.run(meta.geometryId, JSON.stringify(meta));
    } catch (err) {
      //
    }
  }
};

// ========== Reference ==========

// Prepared statement for shst reference INSERTs
const shstReferenceInputStatement = db.prepare(`
  INSERT INTO shst_reference (
    id,
    geometry_id,
    reference 
  ) VALUES(?, ?, ?);
`);

// INSERT the shst references
const insertReferences = references => {
  if (!references) {
    return;
  }

  const referenceArr = Array.isArray(references)
    ? references.filter(_.negate(_.isNil))
    : [references];

  if (!referenceArr.length) {
    return;
  }

  for (let i = 0; i < referenceArr.length; i++) {
    const reference = referenceArr[i];
    const { id, geometryId } = reference;

    try {
      shstReferenceInputStatement.run(
        id,
        geometryId,
        JSON.stringify(reference)
      );
    } catch (err) {
      //
    }
  }
};

// Prepared statement for joining db tables for shstReference Feature iterator creation.
const shstGeometryMetadataIteratorQuery = db.prepare(`
  SELECT
      geom_feature,
      metadata
    FROM shst_geom_meta_join_view
`);

function* makeGeometryMetadataIterator() {
  const iterator = shstGeometryMetadataIteratorQuery.iterate();

  for (const { geom_feature, metadata } of iterator) {
    yield {
      geometryFeature: geom_feature ? JSON.parse(geom_feature) : null,
      metadata: metadata ? JSON.parse(metadata) : null
    };
  }
}

// Prepared statement for joining db tables for shstReference Feature iterator creation.
const shstReferenceFeatureIteratorQuery = db.prepare(`
  SELECT
      shst_reference_id,
      geom_feature,
      metadata,
      is_forward
    FROM shst_ref_geom_meta_join_view
    ORDER BY shst_reference_id ;
`);

const makeShStReferenceFeatureIterator = () => {
  const iterator = shstReferenceFeatureIteratorQuery.iterate();
  return new ShStReferenceFeatureIterator(iterator);
};

module.exports = {
  insertGeometries,
  insertMetadata,
  insertReferences,
  makeGeometryMetadataIterator,
  makeShStReferenceFeatureIterator
};
