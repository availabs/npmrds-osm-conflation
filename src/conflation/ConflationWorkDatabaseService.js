/* eslint no-restricted-syntax: 0 */

const { join } = require('path');
const _ = require('lodash');

const Database = require('better-sqlite3');

const targetMapsSQLiteService = require('../services/targetMapsSQLiteService');
const conflationMapSQLiteService = require('../services/conflationMapSQLiteService');

const getGeoProximityKey = require('../utils/getGeoProximityKey');

const initializeWorkDatabase = db => {
  db.exec(`
    BEGIN;

    CREATE TABLE IF NOT EXISTS conflation_map_features (
      proto_id            INT PRIMARY KEY,
      network_level       REAL NOT NULL,
      geoprox_key         TEXT NOT NULL,
      feature             TEXT NOT NULL -- JSON
    ) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS conflation_map_metadata (
      conflation_map_proto_id  INT,
      target_map               TEXT NOT NULL,
      matched_target_map_id    TEXT NOT NULL,
      matched_target_map_idx   INT NOT NULL,
      shst_ref_split_idx       INT NOT NULL,
      PRIMARY KEY (
        conflation_map_proto_id,
        target_map
      )
    ) WITHOUT ROWID;

    COMMIT;
  `);
};

const createInsertFeatureStmnt = db =>
  db.prepare(`
    INSERT INTO conflation_map_features (
      proto_id,
      network_level,
      geoprox_key,
      feature
    ) VALUES(?, ?, ?, json(?)) ;
  `);

const createInsertMetadataStmnt = db =>
  db.prepare(`
    INSERT INTO conflation_map_metadata (
      conflation_map_proto_id,
      target_map,
      matched_target_map_id,
      matched_target_map_idx,
      shst_ref_split_idx
    ) VALUES(?, ?, ?, ?, ?) ;
  `);

class ConflationWorkDatabaseService {
  constructor(dbDir) {
    const dbFilePath = join(dbDir, 'conflation_work_db');

    const db = new Database(dbFilePath);
    initializeWorkDatabase(db);

    const insertFeatureStmnt = createInsertFeatureStmnt(db);
    const insertMetadataStmnt = createInsertMetadataStmnt(db);

    const targetMaps = Array.prototype.concat(
      targetMapsSQLiteService.getTargetMapsList(),
      'osm'
    );

    let protoId = -1;

    this.insertFeature = feature => {
      ++protoId;
      console.log('protoId:', protoId);

      const {
        properties: { networklevel, segmentIndex }
      } = feature;

      const geoproxKey = getGeoProximityKey(feature);

      const strFeature = JSON.stringify(feature);

      try {
        insertFeatureStmnt.run([protoId, networklevel, geoproxKey, strFeature]);

        for (let i = 0; i < targetMaps.length; ++i) {
          const targetMap = targetMaps[i];

          const metadataKey = `${targetMap}`;
          const targetMapMetadata = feature.properties[metadataKey];

          if (!_.isNil(targetMapMetadata)) {
            const {
              matchedTargetMapId,
              matchedTargetMapMicroProtoId,
              matchedTargetMapMicroId,
              matchedTargetMapMicroIdx = 0
            } = targetMapMetadata;

            // ID Order of preference
            const conflationMapMatchedTargetMapId =
              matchedTargetMapMicroId || // meso-level-sortable matches
              matchedTargetMapMicroProtoId || // micro-level-sortable matches
              matchedTargetMapId; // all matched targetMap features

            insertMetadataStmnt.run([
              protoId,
              targetMap,
              conflationMapMatchedTargetMapId,
              +matchedTargetMapMicroIdx || 0,
              +segmentIndex
            ]);
          }
        }
      } catch (err) {
        console.error(err);
      }
    };

    this.mergeConflationMetadataIntoFeatures = () => {
      db.exec(
        `
         BEGIN;

         CREATE TEMPORARY TABLE tmp_conflation_map_indexes (
           conflation_map_proto_id  INT,
           target_map               TEXT NOT NULL,
           matched_target_map_id    TEXT NOT NULL,
           conflation_map_idx       INT,
           PRIMARY KEY (conflation_map_proto_id, target_map)
         ) WITHOUT ROWID;

         INSERT INTO tmp_conflation_map_indexes (
           conflation_map_proto_id,
           target_map,
           matched_target_map_id,
           conflation_map_idx
         )  SELECT
                conflation_map_proto_id,
                target_map,
                matched_target_map_id,
                (
                  ROW_NUMBER ()
                    OVER (
                      PARTITION BY target_map, matched_target_map_id
                      ORDER BY matched_target_map_idx, shst_ref_split_idx
                    ) - 1 -- zero-index
                ) AS conflation_map_idx
              FROM conflation_map_metadata
          ;

          COMMIT;

          VACUUM;
        `
      );

      for (let i = 0; i < targetMaps.length; ++i) {
        const targetMap = targetMaps[i];

        console.log('==> merging', targetMap);

        db.prepare(
          `
          UPDATE conflation_map_features
            SET
              feature = json_patch(
                feature,
                json_object(
                  'properties',
                  coalesce(
                    (
                      SELECT 
                          json_object(
                            target_map,
                            json_object(
                              'conflationMapMatchedTargetMapId',
                              matched_target_map_id,
                              'conflationMapMatchedTargetMapIdx',
                              conflation_map_idx
                            )
                          )
                        FROM tmp_conflation_map_indexes
                        WHERE (
                          ( conflation_map_features.proto_id = tmp_conflation_map_indexes.conflation_map_proto_id )
                          AND
                          ( tmp_conflation_map_indexes.target_map == '${targetMap}' )
                        )
                    ), json('{}')
                  )
                )
              )
            WHERE ( json_extract(feature, '$.properties.${targetMap}') IS NOT NULL )
          ;
        `
        ).run();
      }
    };

    this.loadConflationMapFeaturesIntoPermanentDatabase = () => {
      const iterator = db
        .prepare(
          `
            SELECT feature
              FROM conflation_map_features
              ORDER BY network_level, geoprox_key
          ;`
        )
        .raw()
        .iterate();

      let id = 0;
      for (const strFeature of iterator) {
        ++id;
        const feature = JSON.parse(strFeature);
        feature.id = id;
        feature.properties.conflationMapId = id;
        conflationMapSQLiteService.insertConflationMapFeature(feature);
      }
    };
  }
}

module.exports = ConflationWorkDatabaseService;
