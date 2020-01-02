/* eslint no-restricted-syntax: 0 */

const { join } = require('path');

const Database = require('better-sqlite3');
const targetMapsSQLiteService = require('../services/targetMapsSQLiteService');

const initializeMicroLevelDatabase = db => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS target_map_features (
      id           TEXT PRIMARY KEY,
      feature      TEXT NOT NULL -- JSON
    ) WITHOUT ROWID;
  `);
};

const initializeMesoLevelDatabase = db => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS target_map_features_meso_level_properties (
      id                     TEXT PRIMARY KEY, 
      meso_level_properties  TEXT NOT NULL -- JSON
    ) WITHOUT ROWID;
  `);
};

const initializeJoinedDatabase = (db, microLevelDbPath, mesoLevelDbPath) =>
  db.exec(`
    BEGIN;

    ATTACH '${microLevelDbPath}' AS micro_level;
    ATTACH '${mesoLevelDbPath}' AS meso_level;

    COMMIT;
  `);

const closeLevelSpecificDatabases = (microLevelDb, mesoLevelDb) => {
  microLevelDb.close();
  mesoLevelDb.close();
};

const createInsertTargetMapFeatureStmnt = db =>
  db.prepare(`
    INSERT INTO target_map_features (
        id,
        feature
      ) VALUES(?, json(?))
    ;
  `);

const createInsertTargetMapFeatureMesoLevelPropertiesStmt = db =>
  db.prepare(`
      INSERT INTO target_map_features_meso_level_properties (
          id,
          meso_level_properties
      ) VALUES(?, json(?))
      ;
  `);

class TargetMapLoadingWorkDatabaseService {
  constructor(targetMap, dbDir) {
    // We need separate databases for the micro and meso levels because of the following error:
    // (node:27119) UnhandledPromiseRejectionWarning: TypeError: This database connection is busy executing a query
    //
    // You cannot update the database while iterating over a cursor.

    const microLevelDbPath = join(dbDir, `${targetMap}_micro_level`);
    const mesoLevelDbPath = join(dbDir, `${targetMap}_meso_level`);
    const joinedDbPath = join(dbDir, targetMap);

    const microLevelDb = new Database(microLevelDbPath);
    const mesoLevelDb = new Database(mesoLevelDbPath);
    let joinedDb;

    initializeMicroLevelDatabase(microLevelDb);
    initializeMesoLevelDatabase(mesoLevelDb);

    const insertTargetMapFeaturesStmnt = createInsertTargetMapFeatureStmnt(
      microLevelDb
    );

    this.insertTargetMapFeature = feature => {
      const { id } = feature;

      const strFeature = JSON.stringify(feature);
      insertTargetMapFeaturesStmnt.run([id, strFeature]);
    };

    const insertTargetMapFeatureMesoLevelPropertiesStmt = createInsertTargetMapFeatureMesoLevelPropertiesStmt(
      mesoLevelDb
    );

    this.insertTargetMapMesoLevelProperties = ({
      id,
      targetMapMesoLevelIdx = null,
      targetMapMesoLevelSortMethod = null,
      targetMapMesoLevelBearing = null
    }) => {
      try {
        insertTargetMapFeatureMesoLevelPropertiesStmt.run([
          id,
          JSON.stringify({
            properties: {
              targetMapMesoLevelIdx,
              targetMapMesoLevelSortMethod,
              targetMapMesoLevelBearing
            }
          })
        ]);
      } catch (err) {
        console.error(err);
        throw err;
      }
    };

    this.makeTargetMapFeaturesGroupedByTargetMapMesoIdIterator = function* generator() {
      const q = microLevelDb.prepare(`
        SELECT
            JSON_EXTRACT(feature, '$.properties.targetMapMesoId'),
            GROUP_CONCAT(feature)
          FROM target_map_features
          WHERE ( JSON_EXTRACT(feature, '$.properties.targetMapMesoId') IS NOT NULL )
          GROUP BY 1
          ORDER BY 1
      `);

      const iterator = q.raw().iterate();

      for (const [targetMapMesoId, strFeatures] of iterator) {
        const features = JSON.parse(`[${strFeatures}]`);

        yield { targetMapMesoId, features };
      }
    };

    this.mergeTargetMapMesoLevelPropertiesIntoTargetMapFeatures = () => {
      // At this state, the microLevel and mesoLevel DBs are closed to modification.
      closeLevelSpecificDatabases(microLevelDb, mesoLevelDb);

      joinedDb = new Database(joinedDbPath);

      initializeJoinedDatabase(joinedDb, microLevelDbPath, mesoLevelDbPath);

      joinedDb
        .prepare(
          `
          UPDATE micro_level.target_map_features
            SET
              feature = json_patch(
                feature,
                coalesce(
                  (
                    SELECT
                        meso_level_properties
                      FROM meso_level.target_map_features_meso_level_properties
                        WHERE ( id = micro_level.target_map_features.id )
                  ),
                  json('{}')
                )
              )
          ;
        `
        )
        .run();
    };

    this.loadTargetMapFeaturesIntoPermanentDatabase = () => {
      const iterator = joinedDb
        // .prepare(`SELECT feature FROM target_map_features;`)
        .prepare(`SELECT feature FROM target_map_features;`)
        .raw()
        .iterate();

      for (const feature of iterator) {
        targetMapsSQLiteService.insertFeatures(targetMap, JSON.parse(feature));
      }
    };
  }
}

module.exports = TargetMapLoadingWorkDatabaseService;
