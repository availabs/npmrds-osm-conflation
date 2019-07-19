BEGIN;

--  DROP SCHEMA sharedstreets CASCADE;
CREATE SCHEMA IF NOT EXISTS sharedstreets;

-- SharedStreets References:
--   basemap-independent references for intersection to intersection street segments
CREATE TABLE IF NOT EXISTS sharedstreets.reference (
 id                       CHARACTER VARYING,
 geometry_id              CHARACTER VARYING,
 form_of_way              CHARACTER VARYING,
 location_references      JSONB
) WITH (fillfactor=100,autovacuum_enabled=false) ;

CREATE INDEX reference_geometry_id_idx
 ON sharedstreets.reference (geometry_id)
;

CLUSTER sharedstreets.reference
 USING reference_geometry_id_idx
;

CREATE INDEX reference_location_references_idx
 ON sharedstreets.reference
 USING GIN (location_references)
;

-- SharedStreets Intersection:
--   nodes connecting street street segments references
CREATE TABLE IF NOT EXISTS sharedstreets.intersection (
 id                       CHARACTER VARYING,
 node_id                  CHARACTER VARYING,
 inbound_reference_ids    CHARACTER VARYING[],
 outbound_reference_ids   CHARACTER VARYING[],
 lon                      DOUBLE PRECISION,
 lat                      DOUBLE PRECISION,
 the_geom                 geometry(Point, 4326)
) WITH (fillfactor=100,autovacuum_enabled=false) ;

CREATE INDEX intersection_geom_idx
 ON sharedstreets.intersection
 USING GIST (the_geom)
;

CLUSTER sharedstreets.intersection
 USING intersection_geom_idx;

-- SharedStreets Geometries:
--   geometries used to generate street segment references
CREATE TABLE IF NOT EXISTS sharedstreets.geometry (
 id                       CHARACTER VARYING,
 from_intersection_id     CHARACTER VARYING,
 to_intersection_id       CHARACTER VARYING,
 forward_reference_id     CHARACTER VARYING,
 back_reference_id        CHARACTER VARYING,
 road_class               CHARACTER VARYING,
 lonlats                  DOUBLE PRECISION[],
 the_geom                 geometry(LineString, 4326)
) WITH (fillfactor=100,autovacuum_enabled=false) ;

CREATE INDEX geometry_geom_idx
 ON sharedstreets.geometry
 USING GIST(the_geom)
;

CLUSTER sharedstreets.geometry
 USING geometry_geom_idx
;

-- OSM Metadata:
--   underlying OSM way and node references used to construct SharedStreets data
CREATE TABLE IF NOT EXISTS sharedstreets.metadata (
 geometry_id              CHARACTER VARYING,
 gis_metadata             JSONB,
 osm_metadata             JSONB,
 name                     CHARACTER VARYING
) WITH (fillfactor=100,autovacuum_enabled=false) ;

CREATE INDEX metadata_osm_metadata_idx
 ON sharedstreets.metadata
 USING GIN(osm_metadata)
;

--  CLUSTER sharedstreets.metadata USING metadata_osm_metadata_idx;

CREATE TABLE IF NOT EXISTS sharedstreets.tmc_matches (
  tmc                        CHARACTER VARYING,
  shst_reference_id          CHARACTER VARYING,
  shst_geometry_id           CHARACTER VARYING,
  shst_from_intersection_id  CHARACTER VARYING,
  shst_to_intersection_id    CHARACTER VARYING,
  gis_reference_id           CHARACTER VARYING,
  gis_geometry_id            CHARACTER VARYING,
  gis_total_segments         INT,
  gis_segment_index          INT,
  gis_from_intersection_id   CHARACTER VARYING,
  gis_to_intersection_id     CHARACTER VARYING,
  start_side_of_street       CHARACTER VARYING,
  end_side_of_street         CHARACTER VARYING,
  side_of_street             CHARACTER VARYING,
  score                      REAL,
  match_type                 CHARACTER VARYING
) WITH (fillfactor=100,autovacuum_enabled=false) ;

CREATE INDEX IF NOT EXISTS tmc_matches_tmc_idx
  ON sharedstreets.tmc_matches (tmc);

CLUSTER sharedstreets.tmc_matches USING tmc_matches_tmc_idx;

COMMIT;
