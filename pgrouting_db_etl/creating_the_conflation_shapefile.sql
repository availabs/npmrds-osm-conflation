BEGIN;

--  \set NPMRDS_BUFFER_W 10
--  \set RIS_BUFFER_W 15
-- 
-- -- CREATE OR REPLACE VIEW ris2tmc AS
-- --   SELECT
-- --       tmc,
-- --       ogc_fid AS ris_ogc_fid,
-- --       dot_id
-- --     FROM sharedstreets.tmc_matches
-- --       INNER JOIN sharedstreets.ris_matches
-- --       USING (shst_reference_id)
-- -- ;
-- -- 
--  DROP TABLE IF EXISTS tmp_buffered_ris CASCADE;
--  CREATE TABLE IF NOT EXISTS tmp_buffered_ris AS
--  SELECT
--      ogc_fid,
--      dot_id::VARCHAR,
--      wkb_geometry,
--      ST_Transform(
--        ST_Buffer(
--          GEOGRAPHY(
--            wkb_geometry
--          ),
--          :RIS_BUFFER_W,
--          'endcap=flat join=round'
--        )::GEOMETRY, 4326
--      ) AS buffered_geom
--    FROM ris.road_inventory_system
--    WHERE (
--      county_name = 'ALBANY'
--    )
--  ;
--  
--  DROP TABLE IF EXISTS tmp_buffered_npmrds CASCADE;
--  CREATE TABLE IF NOT EXISTS tmp_buffered_npmrds AS
--   SELECT
--       tmc,
--       wkb_geometry,
--       ST_Transform(
--         ST_Buffer(
--           GEOGRAPHY(
--             wkb_geometry
--           ),
--           :NPMRDS_BUFFER_W,
--           'endcap=flat join=round'
--         )::GEOMETRY, 4326
--       ) AS buffered_geom
--     FROM npmrds_extended_shapefile
--     WHERE (
--       county = 'ALBANY'
--     )
--  ;

-- CREATE OR REPLACE VIEW sharedstreets.geom_ways_nodes_view
--   AS
--     SELECT
--         geometry_id,
--         TRIM(
--           both '"' FROM way_section->>'wayId'
--         ) AS way_id,
--         (way_sections).way_geom_idx,
--         TRIM(
--           both '"' FROM node_id::TEXT
--         ) AS node_id,
--         (node_ids).node_way_idx
--       FROM sharedstreets.metadata,
--         jsonb_array_elements(
--           osm_metadata->'waySections'
--         ) WITH ordinality AS way_sections(way_section, way_geom_idx),
--         jsonb_array_elements(
--           (way_sections).way_section->'nodeIds'
--         ) WITH ordinality AS node_ids(node_id, node_way_idx)
-- ;

-- -- npmrds_routing=# select distinct st_numgeometries(the_geom) from geometry;
-- --  st_numgeometries
-- -- ------------------
-- --                 1
-- -- (1 row)

-- -- Segmentize all shst geometry linestrings at each vertex
-- DROP TABLE IF EXISTS shstgeoms_segments CASCADE;
-- CREATE TABLE IF NOT EXISTS shstgeoms_segments AS
--   SELECT
--       geometry_id,
--       ST_Transform(
--         ST_MakeLine(
--           (pts_0).geom,
--           (pts_1).geom
--         ), 4326
--       )::Geometry(LineString, 4326) AS geom_segment,
--       (pts_0).path[1] AS seg_idx
--     FROM (
--       SELECT
--           id AS geometry_id,
--           pts AS pts_0,
--           lead(pts) over (partition by g.id order by (pts).path) AS pts_1
--         FROM sharedstreets.geometry AS g, ST_DumpPoints(the_geom) AS pts
--     ) AS t
--     WHERE (
--       pts_1 IS NOT NULL
--     )
-- ;

--  DROP TABLE IF EXISTS ris_shstgeoms_segments CASCADE;
--  CREATE TABLE IF NOT EXISTS ris_shstgeoms_segments AS
--    SELECT DISTINCT
--        ogc_fid,
--        dot_id,
--        geometry_id,
--        geom_segment,
--        seg_idx
--      FROM (
--        SELECT
--            m.ogc_fid,
--            m.dot_id,
--            b.buffered_geom,
--            geometry_id,
--            geom_segment,
--            seg_idx
--          FROM sharedstreets.ris_matches AS m
--            INNER JOIN tmp_buffered_ris AS b USING (ogc_fid, dot_id)
--            INNER JOIN shstgeoms_segments s ON (m.shst_geometry_id = s.geometry_id)
--      ) AS t
--      WHERE (
--        ST_Intersects(buffered_geom, geom_segment)
--      )
--  ;
--  
--  DROP TABLE IF EXISTS npmrds_shstgeoms_segments CASCADE;
--  CREATE TABLE IF NOT EXISTS npmrds_shstgeoms_segments AS
--    SELECT DISTINCT
--        tmc,
--        geometry_id,
--        geom_segment,
--        seg_idx
--      FROM (
--        SELECT
--            tmc,
--            b.buffered_geom,
--            geometry_id,
--            geom_segment,
--            seg_idx
--          FROM sharedstreets.tmc_matches AS m
--            INNER JOIN tmp_buffered_npmrds AS b USING (tmc)
--            INNER JOIN shstgeoms_segments s ON (m.shst_geometry_id = s.geometry_id)
--      ) AS t
--      WHERE (
--        ST_Intersects(buffered_geom, geom_segment)
--      )
--  ;
--  
--  DROP TABLE IF EXISTS ris_shstgeoms_contigous_segments CASCADE;
--  CREATE TABLE IF NOT EXISTS ris_shstgeoms_contigous_segments AS
--    SELECT
--        *
--      FROM (
--        SELECT
--            ogc_fid,
--            dot_id,
--            geometry_id,
--            min(seg_idx) AS start_geom_seg,
--            max(seg_idx) AS end_geom_seg
--          FROM ris_shstgeoms_segments
--          GROUP BY ogc_fid, dot_id, geometry_id
--      ) AS t0 NATURAL INNER JOIN (
--        SELECT
--            geometry_id,
--            max(seg_idx) AS max_geom_seg
--          FROM shstgeoms_segments
--          GROUP BY geometry_id
--      ) AS t1
--  ;
--  
--  DROP TABLE IF EXISTS npmrds_shstgeoms_contigous_segments CASCADE;
--  CREATE TABLE IF NOT EXISTS npmrds_shstgeoms_contigous_segments AS
--    SELECT
--        *
--      FROM (
--        SELECT
--            tmc,
--            geometry_id,
--            min(seg_idx) AS start_geom_seg,
--            max(seg_idx) AS end_geom_seg
--          FROM npmrds_shstgeoms_segments
--          GROUP BY tmc, geometry_id
--      ) AS t0 NATURAL INNER JOIN (
--        SELECT
--            geometry_id,
--            max(seg_idx) AS max_geom_seg
--          FROM shstgeoms_segments
--          GROUP BY geometry_id
--      ) AS t1
--  ;
--  
--   DROP VIEW IF EXISTS shstgeoms_contigous_segments CASCADE;
--   CREATE OR REPLACE VIEW shstgeoms_contigous_segments AS
--     SELECT
--         geometry_id,
--         start_geom_seg,
--         end_geom_seg,
--         max_geom_seg
--       FROM npmrds_shstgeoms_contigous_segments
--     UNION
--     SELECT
--         geometry_id,
--         start_geom_seg,
--         end_geom_seg,
--         max_geom_seg
--       FROM ris_shstgeoms_contigous_segments
--   ;
--  
--  
--   -- The following creates parallel arrays start_segs and end_segs
--   DROP TABLE IF EXISTS shstgeoms_decomposed CASCADE;
--   CREATE TABLE IF NOT EXISTS shstgeoms_decomposed AS
--     SELECT
--         geometry_id,
--         array_remove(
--           array_agg(DISTINCT start_geom_seg ORDER BY start_geom_seg),
--           NULL
--         ) AS start_segs,
--         array_remove(
--           array_agg(DISTINCT end_geom_seg ORDER BY end_geom_seg),
--           NULL
--         ) AS end_segs
--       FROM (
--         SELECT
--             geometry_id,
--             1 AS start_geom_seg,
--             NULL AS end_geom_seg
--           FROM shstgeoms_segments
--         UNION 
--         SELECT
--             geometry_id,
--             NULL AS start_geom_seg,
--             MAX(seg_idx) AS end_geom_seg
--           FROM shstgeoms_segments
--           GROUP BY geometry_id
--         UNION 
--         SELECT
--             geometry_id,
--             start_geom_seg,
--             end_geom_seg
--           FROM shstgeoms_contigous_segments
--         UNION 
--         SELECT
--             geometry_id,
--             NULL AS start_geom_seg,
--             start_geom_seg - 1 AS end_geom_seg
--           FROM shstgeoms_contigous_segments
--           WHERE (
--             start_geom_seg <> 1
--           )
--         UNION 
--         SELECT
--             geometry_id,
--             end_geom_seg + 1 AS start_geom_seg,
--             NULL AS end_geom_seg
--           FROM shstgeoms_contigous_segments AS scs
--             NATURAL INNER JOIN (
--               SELECT
--                    geometry_id,
--                    max(seg_idx) AS max_geom_seg
--                 FROM shstgeoms_segments
--                 GROUP BY geometry_id
--             ) AS t1 
--           WHERE (
--             scs.end_geom_seg <> t1.max_geom_seg
--           )
--       ) AS t
--       GROUP BY geometry_id
--   ;
--  -- npmrds_routing=# select * from shstgeoms_decomposed order by array_length(start_segs, 1) desc limit 3;
--  -- -[ RECORD 1 ]----------------------------------------------------------------
--  -- geometry_id | b07f209b418c55fce08e76538e2f2f7c
--  -- start_segs  | {1,2,3,4,5,16,18,19,21,23,25,26,38,39,53,54,57,58,59,60,61,62}
--  -- end_segs    | {1,2,3,4,15,17,18,20,22,24,25,37,38,52,53,56,57,58,59,60,61,62}
--  -- -[ RECORD 2 ]----------------------------------------------------------------
--  -- geometry_id | b40a072b888e0ceeb01026e2d5b36136
--  -- start_segs  | {1,8,9,12,13,14,15,16,17,18,22,23,25,26,27,28,29,30,40,41}
--  -- end_segs    | {7,8,11,12,13,14,15,16,17,21,22,24,25,26,27,28,29,39,40,46}
--  -- -[ RECORD 3 ]----------------------------------------------------------------
--  -- geometry_id | f17af19ca25aac3d42a94b8490b3d962
--  -- start_segs  | {1,4,5,6,7,8,9,24,25,27,28,31,32,43,44,49,50,53}
--  -- end_segs    | {3,4,5,6,7,8,23,24,26,27,30,31,42,43,48,49,52,53}
--  
--  -- This works. Just need to nest it and collect the line segments.
--  --   SELECT
--  --       geometry_id,
--  --       start_seg_idx,
--  --       end_seg_idx,
--  --       start_seg.recomp_idx
--  --     FROM shstgeoms_decomposed,
--  --       LATERAL UNNEST(start_segs) WITH ORDINALITY AS start_seg(start_seg_idx, recomp_idx)
--  --       INNER JOIN LATERAL UNNEST(end_segs) WITH ORDINALITY AS end_seg(end_seg_idx, recomp_idx)
--  --         ON (start_seg.recomp_idx = end_seg.recomp_idx)
--  -- ;
--  
--  DROP TABLE IF EXISTS shstgeoms_recomposed CASCADE;
--  CREATE TABLE IF NOT EXISTS shstgeoms_recomposed AS
--    SELECT
--        geometry_id,
--        start_seg_idx,
--        end_seg_idx,
--        recomp_idx,
--        ST_Transform(
--          ST_LineMerge(
--            ST_Union(
--              geom_segment ORDER BY (recomp_idx)
--            )
--          ), 4326
--        ) AS the_geom
--        --  )::Geometry(LineString, 4326) AS the_geom
--      FROM (
--        SELECT DISTINCT
--            geometry_id,
--            start_seg_idx,
--            end_seg_idx,
--            start_seg.recomp_idx
--          FROM shstgeoms_decomposed,
--            LATERAL UNNEST(start_segs) WITH ORDINALITY AS start_seg(start_seg_idx, recomp_idx)
--            INNER JOIN LATERAL UNNEST(end_segs) WITH ORDINALITY AS end_seg(end_seg_idx, recomp_idx)
--              ON (start_seg.recomp_idx = end_seg.recomp_idx)
--      ) AS sub_seg_extents INNER JOIN shstgeoms_segments USING (geometry_id)
--      JOIN (
--        SELECT
--            ST_ConvexHull(
--              ST_Collect(
--                wkb_geometry
--              )
--            ) AS bpoly
--          FROM public.npmrds_extended_shapefile
--          WHERE (
--            county = 'ALBANY'
--          )
--      ) AS sub_county_poly ON (ST_Contains(bpoly, geom_segment))
--      WHERE (
--        (shstgeoms_segments.seg_idx BETWEEN sub_seg_extents.start_seg_idx AND sub_seg_extents.end_seg_idx)
--      )
--      GROUP BY geometry_id, start_seg_idx, end_seg_idx, recomp_idx
--  ;

--  DROP VIEW IF EXISTS ris_shst_length_diffs;
--  CREATE OR REPLACE VIEW ris_shst_length_diffs AS
--    SELECT
--        ogc_fid,
--        ABS(shst_len - ris_len) / ris_len AS length_diff_ratio
--      FROM (
--        SELECT
--            ogc_fid,
--            SUM(
--              ST_Length(
--                GEOGRAPHY(geom_segment)
--              ) * 3.2808388799999997
--            ) AS shst_len
--          FROM ris_shstgeoms_segments
--          GROUP BY ogc_fid
--      ) AS subshst NATURAL INNER JOIN (
--        select
--            ogc_fid,
--            ST_Length(
--              GEOGRAPHY(wkb_geometry)
--            ) * 3.2808388799999997 AS ris_len
--          FROM ris.road_inventory_system  
--      ) AS subris
--  ;
--  
--  DROP VIEW IF EXISTS npmrds_shst_length_diffs;
--  CREATE OR REPLACE VIEW npmrds_shst_length_diffs AS
--    SELECT
--        tmc,
--        ABS(shst_len - tmc_len) / tmc_len AS length_diff_ratio
--      FROM (
--        SELECT
--            tmc,
--            SUM(
--              ST_Length(
--                GEOGRAPHY(geom_segment)
--              ) * 3.2808388799999997
--            ) AS shst_len
--          FROM npmrds_shstgeoms_segments
--          GROUP BY tmc
--      ) AS subshst NATURAL INNER JOIN (
--        select
--            tmc,
--            ST_Length(
--              GEOGRAPHY(wkb_geometry)
--            ) * 3.2808388799999997 AS tmc_len
--          FROM npmrds_extended_shapefile
--      ) AS subris
--  ;


--  --                    Table "osm.shstgeoms_recomposed"
--  --      Column     |       Type        | Collation | Nullable | Default
--  --  ---------------+-------------------+-----------+----------+---------
--  --   geometry_id   | character varying |           |          |
--  --   start_seg_idx | integer           |           |          |
--  --   end_seg_idx   | integer           |           |          |
--  --   recomp_idx    | bigint            |           |          |
--  --   the_geom      | geometry          |           |          |


 DROP TABLE IF EXISTS npmrds_ris_shst_conflation_1 CASCADE;
 CREATE TABLE IF NOT EXISTS npmrds_ris_shst_conflation_1 AS
   SELECT
       s.geometry_id || '.' || s.recomp_idx::TEXT AS id,
       s.geometry_id,
       s.start_seg_idx,
       s.end_seg_idx,
       s.recomp_idx,
       NULLIF(
         array_remove(
           array_agg(
             DISTINCT r.ogc_fid ORDER BY r.ogc_fid
           ), NULL
         ), ARRAY[]::INTEGER[]
       ) AS ris_fids,
       NULLIF(
         array_remove(
           array_agg(
             DISTINCT r.dot_id ORDER BY r.dot_id
           ), NULL
         ), ARRAY[]::VARCHAR[]
       ) AS ris_dot_ids,
       NULLIF(
         array_remove(
           array_agg(
             DISTINCT n.tmc ORDER BY n.tmc
           ), NULL
         ), ARRAY[]::VARCHAR[]
       ) AS npmrds_tmcs,
       s.the_geom
     FROM shstgeoms_recomposed AS s
       LEFT OUTER JOIN ris_shstgeoms_contigous_segments r
         ON (
           s.geometry_id = r.geometry_id
           AND
           s.start_seg_idx BETWEEN r.start_geom_seg AND r.end_geom_seg
           AND
           s.end_seg_idx BETWEEN r.start_geom_seg AND r.end_geom_seg
         )
       LEFT OUTER JOIN npmrds_shstgeoms_contigous_segments n
         ON (
           s.geometry_id = n.geometry_id
           AND
           s.start_seg_idx BETWEEN n.start_geom_seg AND n.end_geom_seg
           AND
           s.end_seg_idx BETWEEN n.start_geom_seg AND n.end_geom_seg
         )
     GROUP BY s.geometry_id, s.start_seg_idx, s.end_seg_idx, s.recomp_idx, s.the_geom
 ;

COMMIT;
