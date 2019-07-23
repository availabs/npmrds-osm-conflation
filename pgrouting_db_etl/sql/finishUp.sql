--  CLUSTER sharedstreets.reference;
--  CLUSTER sharedstreets.intersection;
--  CLUSTER sharedstreets.geometry;
--  CLUSTER sharedstreets.tmc_matches;

--  CLUSTER pgrouting.osm_ways USING osm_ways_pkey;
--  CLUSTER pgrouting.osm_nodes USING osm_nodes_pkey;
--  CLUSTER pgrouting.osm_relations USING osm_relations_pkey;
--  CLUSTER pgrouting.pointsofinterest USING pointsofinterest_pkey;
--  CLUSTER pgrouting.ways USING ways_the_geom_idx;
--  CLUSTER pgrouting.ways_vertices_pgr USING ways_vertices_pgr_the_geom_idx;

CREATE VIEW sharedstreets.tmcs2ways_via_geometry_id AS
  SELECT DISTINCT
      geometry_id,
      tmc,
      trim(
        both '"' FROM (jsonb_array_elements(osm_metadata->'waySections')->'wayId')::TEXT
      ) AS way_id
    FROM sharedstreets.tmc_matches
      INNER JOIN sharedstreets.metadata
        ON (shst_geometry_id = geometry_id)
;

-- Beginnings of the gid -> ref view
select distinct w.gid, r.id from ways w inner join intersection s on (w.x2 = s.lon and w.y2 = s.lat) inner join intersection e on (w.x1 = e.lon and w.y1 = e.lat) inner join reference r on (r.location_references->0->>'intersectionId' = s.id and r.location_references->1->>'intersectionId' = e.id);
