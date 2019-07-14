CREATE INDEX IF NOT EXISTS npmrds_extended_shapefile_geom_idx
  ON npmrds_extended_shapefile
  USING GIST (wkb_geometry);

CLUSTER npmrds_extended_shapefile
  USING npmrds_extended_shapefile_geom_idx;
