/* eslint no-restricted-syntax: 0 */

const { join } = require('path');

const Database = require('better-sqlite3');

const targetMapsSQLiteService = require('../services/targetMapsSQLiteService');
const shstMatchesSQLiteService = require('../services/shstMatchesSQLiteService');

const initializeMatchedFeaturesWorkDatabase = db => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS matched_features (
      id       TEXT PRIMARY KEY,
      feature  TEXT NOT NULL -- JSON
    ) WITHOUT ROWID;
  `);
};

const initializeMatchedFeaturesMetadataWorkDatabase = db => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS matched_features_metadata (
      id        TEXT PRIMARY KEY,
      metadata  TEXT NOT NULL -- JSON
    ) WITHOUT ROWID;
  `);
};

const initializeJoinedDatabase = (
  db,
  matchedFeaturesWorkDb,
  matchedFeaturesMetadataWorkDb
) =>
  db.exec(`
    BEGIN;

    ATTACH '${matchedFeaturesWorkDb}' AS matches;
    ATTACH '${matchedFeaturesMetadataWorkDb}' AS metadata;

    COMMIT;
  `);

const createInsertMatchedFeatureStmnt = db =>
  db.prepare(`
    INSERT INTO matched_features (
        id,
        feature
      ) VALUES(?, json(?)) ;
  `);

const createUpsertMatchedFeatureMetadataStmnt = db =>
  db.prepare(`
    INSERT INTO matched_features_metadata (
        id,
        metadata
    ) VALUES(?, json(?))
      ON CONFLICT(id) DO
        UPDATE SET metadata = json_patch(metadata, json(?))
    ;
  `);

class ShstMatchingWorkDatabaseService {
  constructor(targetMap, dbDir) {
    // We need separate databases for updating while iterating over a cursor because of the following error:
    // (node:27119) UnhandledPromiseRejectionWarning: TypeError: This database connection is busy executing a query

    const matchedFeaturesWorkDbFilePath = join(dbDir, 'matched_features');
    const matchedFeaturesMetadataWorkDbFilePath = join(
      dbDir,
      'matched_features_metadata'
    );

    const joinedDbPath = join(dbDir, targetMap);

    const matchedFeaturesWorkDb = new Database(matchedFeaturesWorkDbFilePath);
    const matchedFeaturesMetadataWorkDb = new Database(
      matchedFeaturesMetadataWorkDbFilePath
    );
    let joinedDb;

    initializeMatchedFeaturesWorkDatabase(matchedFeaturesWorkDb);
    initializeMatchedFeaturesMetadataWorkDatabase(
      matchedFeaturesMetadataWorkDb
    );

    const insertMatchedFeatureStmnt = createInsertMatchedFeatureStmnt(
      matchedFeaturesWorkDb
    );

    this.insertMatchedFeature = feature => {
      const { id } = feature;

      const strFeature = JSON.stringify(feature);

      try {
        insertMatchedFeatureStmnt.run([id, strFeature]);
      } catch (err) {
        console.error(err);
      }
    };

    const upsertMatchedFeatureMetadataStmt = createUpsertMatchedFeatureMetadataStmnt(
      matchedFeaturesMetadataWorkDb
    );

    this.upsertMatchedFeatureMetadata = (id, metadata) => {
      try {
        upsertMatchedFeatureMetadataStmt.run([
          id,
          JSON.stringify({ properties: metadata }),
          JSON.stringify({ properties: metadata })
        ]);
      } catch (err) {
        console.error(err);
        throw err;
      }
    };

    this.makeUnmatchedTargetMapFeaturesIterator = function* generator() {
      const featureWasMatchedStmnt = matchedFeaturesWorkDb
        .prepare(
          `
        SELECT 1
          FROM matched_features
          WHERE (
            ( JSON_EXTRACT(feature, '$.properties.targetMapId') = ? )
          )
      `
        )
        .raw();

      const iterator = targetMapsSQLiteService.makeFeatureIterator(targetMap);

      let unmatchedCt = 0;
      let startMatchedCt = 0;
      for (const feature of iterator) {
        const { id } = feature;

        // const matched = featureWasMatchedStmnt.get([id]);
        const matched = false

        if (!matched) {
          ++unmatchedCt;
          yield feature;
        } else {
          ++startMatchedCt;
          console.error('WAS MATCHED');
        }
      }

      const endMatchedCt = matchedFeaturesWorkDb
        .prepare(
          `
        SELECT COUNT(DISTINCT JSON_EXTRACT(feature, '$.properties.targetMapId')) FROM matched_features ;
      `
        )
        .raw()
        .get();

      const matchedDuringIteratoration = endMatchedCt - startMatchedCt;
      console.log(
        `=== Matched ${matchedDuringIteratoration} out of ${unmatchedCt}`
      );
    };

    this.makeMatchedFeaturesGroupedAtTargetMapMesoLevelIterator = function* generator() {
      const q = matchedFeaturesWorkDb.prepare(`
        SELECT
            JSON_EXTRACT(feature, '$.properties.targetMapMesoId'),
            JSON_EXTRACT(feature, '$.properties.targetMapMesoLevelBearing'),
            GROUP_CONCAT(feature)
          FROM matched_features
          WHERE (
            ( JSON_EXTRACT(feature, '$.properties.targetMapMesoId') IS NOT NULL )
            AND
            ( JSON_EXTRACT(feature, '$.properties.targetMapMesoLevelBearing') IS NOT NULL )
          )
          GROUP BY 1, 2
          ORDER BY 1, 2
      `);

      const iterator = q.raw().iterate();

      for (const [
        targetMapMesoId,
        targetMapMesoLevelBearing,
        strFeatures
      ] of iterator) {
        const shstMatchedFeatures = JSON.parse(`[${strFeatures}]`);

        yield {
          targetMapMesoId,
          targetMapMesoLevelBearing,
          shstMatchedFeatures
        };
      }
    };

    this.makeMatchedFeaturesGroupedAtTargetMapMegaLevelIterator = function* generator() {
      const q = matchedFeaturesWorkDb.prepare(`
        SELECT
            JSON_EXTRACT(feature, '$.properties.targetMapMegaId'),
            GROUP_CONCAT(feature)
          FROM matched_features
          WHERE (
            ( JSON_EXTRACT(feature, '$.properties.targetMapMegaId') IS NOT NULL )
          )
          GROUP BY 1
          ORDER BY 1
      `);

      const iterator = q.raw().iterate();

      for (const [targetMapMegaId, strFeatures] of iterator) {
        const shstMatchedFeatures = JSON.parse(`[${strFeatures}]`);

        yield {
          targetMapMegaId,
          shstMatchedFeatures
        };
      }
    };

    const openJoinedDatabase = () => {
      joinedDb = new Database(joinedDbPath);

      initializeJoinedDatabase(
        joinedDb,
        matchedFeaturesWorkDbFilePath,
        matchedFeaturesMetadataWorkDbFilePath
      );
    }

    // At this state, the matchedFeaturesWorkDb and matchedFeaturesMetadataWorkDb are closed to modification.
    this.mergeTargetMapMatchedFeaturesMetadataWorkPropertiesIntoTargetMapFeatures = () => {
      if (!joinedDb) {
        openJoinedDatabase()
      }

      joinedDb.exec(
        `
          UPDATE matches.matched_features
            SET
              feature = json_patch(
                feature,
                coalesce(
                  (
                    SELECT
                        metadata
                      FROM metadata.matched_features_metadata
                        WHERE (
                          ( metadata.matched_features_metadata.id = matches.matched_features.id )
                        )
                  ),
                  json('{}')
                )
              )
          ;
        `
      );
    };

    this.loadShstMatchesIntoPermanentDatabase = () => {
      if (!joinedDb) {
        openJoinedDatabase()
      }

      const iterator = joinedDb
        .prepare(`SELECT feature FROM matches.matched_features;`)
        .raw()
        .iterate();

      for (const strFeature of iterator) {
        const feature = JSON.parse(strFeature)
        console.log(feature.id)
        shstMatchesSQLiteService.insertFeatures([feature]);
      }
    };
  }
}

module.exports = ShstMatchingWorkDatabaseService;
