# Use bash for sub-shells, allowing use of bash-specific functionality.
SHELL := /bin/bash

MKFILE_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

#############
## The canonical locations of directories and files
##   that are used across processing tasks are defined here.


# NPMRDS
NPMRDS_DATA_DIR=${MKFILE_DIR}data/npmrds

# RIS
RIS_DATA_DIR=${MKFILE_DIR}data/ris

# SharedStreets
SHST_TILES_DIR=${MKFILE_DIR}sharedstreets/shst_tiles_pbf

#############

# https://www.gnu.org/software/make/manual/make.html#Special-Targets
# The targets which .SECONDARY depends on are treated as intermediate files,
# 	except that they are never automatically deleted. See Chains of Implicit Rules.
# 
# .SECONDARY with no prerequisites causes all targets to be treated as secondary
# 	(i.e., no target is removed because it is considered intermediate).
.SECONDARY:

# These are simplified aliases for processing outputs.
.PHONY: npm_install preprocess_npmrds preprocess_ris

npm_install:
	@npm install

lib/sharedstreets-builder-0.3.1.jar:
	@mkdir -p lib
	@wget --quiet --directory-prefix=lib \
		https://github.com/sharedstreets/sharedstreets-builder/releases/download/0.3.1/sharedstreets-builder-0.3.1.jar

lib/lev2:
	curl -L https://github.com/maxlath/lev2/archive/v3.0.0.tar.gz > lib/lev2-3.0.0.tar.gz
	tar zxf lib/lev2-3.0.0.tar.gz --directory lib/ && rm -f lib/lev2-3.0.0.tar.gz
	mv lib/lev2-3.0.0 lib/lev2

init: npm_install lib/sharedstreets-builder-0.3.1.jar
	echo "${NPMRDS_TMC_IDENTIFICATION_FILE_PATH}"
	echo 

${OSM_NYS_PBF}:
	@./source_data_preprocessing/osm_planet_processing/run process_nys_osm \
		--osm_planet_version="${OSM_PLANET_VERSION}" \
		--osm_data_dir="${OSM_DATA_DIR}" \
		--osm_nys_pbf="${OSM_NYS_PBF}"

osm/nys.osm.pbf: ${OSM_NYS_PBF}

preprocess_npmrds:
	@./source_data_preprocessing/npmrds/run process_npmrds_metadata \
      --npmrds_data_dir="${NPMRDS_DATA_DIR}"

preprocess_ris:
	@./source_data_preprocessing/ris/run process_ris_metadata \
      --ris_data_dir="${RIS_DATA_DIR}"

npmrds/partitioned_county_geojsons: ${NPMRDS_PARTITIONED_COUNTY_GEOJSONS_DIR}
	
# data/sharedstreets/shst_matched_npmrds:
# 	./bin/data_processing/runSharedStreetsMatchOnNPMRDSPartitions \
# 		data/npmrds/county_geojson_partitions \
# 		data/sharedstreets/shst_matched_npmrds
# 		
# data/sharedstreets/shst_matched_ris:
# 	./bin/data_processing/runSharedStreetsMatchOnRISPartitions \
# 		data/ris/county_geojson_partitions \
# 		data/sharedstreets/shst_matched_ris
# 		
# sharedstreets_match: data/sharedstreets/shst_matched_npmrds data/sharedstreets/shst_matched_ris
# 
# data/sharedstreets/shst_tiles_pbf:
# 	./bin/data_getting/copySharedStreetsTileCache \
# 		"${HOME}/.shst/cache/tiles/osm/planet-${OSM_PLANET_VERSION}" \
# 		"${SHST_TILES_DIR}"
# 
# # This one's just for creating a directory of easily inspectable tiles.
# #   Not really part of the pipeline.
# data/sharedstreets/shst_tiles_ndjson:
# 	./bin/data_transforming/tileSetToNDJSON \
# 		--tilesetDir "${SHST_TILES_DIR}" \
# 		--outputDir data/sharedstreets/shst_tiles_ndjson \
# 		--clean
# 
# scrapeMissingSharedStreetsGeometryFiles:
# 	./bin/data_getting/scrapeMissingSharedStreetsGeometryFiles \
# 		--tilesetDir ./data/sharedstreets/shst_tiles_pbf \
# 		--shstMatchedNpmrdsDir data/npmrds/shst_matched \
# 		--shstMatchedRisDir data/ris/shst_matched
# 
# scrapeMissingSharedStreetsMetadataTiles:
# 	./bin/data_getting/scrapeMissingSharedStreetsMetadataTiles "${OSM_PLANET_VERSION}" "${SHST_TILES_DIR}"
# 
# scrapeMissingSharedStreetsIntersectionTiles:
# 	./bin/data_getting/scrapeMissingSharedStreetsIntersectionTiles "${OSM_PLANET_VERSION}" "${SHST_TILES_DIR}"
# 
# data/leveldb/shstGeometry:
# 	./bin/data_loading_leveldb/loadShStGeometryTiles \
# 		--tilesetDir data/sharedstreets/shst_tiles_pbf \
# 		--leveldbDir data/leveldb/shstGeometry \
# 		--clean
# 
# data/leveldb/shstReference:
# 	./bin/data_loading_leveldb/loadShStReferenceTiles \
# 		--tilesetDir data/sharedstreets/shst_tiles_pbf \
# 		--leveldbDir data/leveldb/shstReference \
# 		--clean
# 
# data/leveldb/shstMetadata:
# 	./bin/data_loading_leveldb/loadShStMetadataTiles \
# 		--tilesetDir data/sharedstreets/shst_tiles_pbf \
# 		--leveldbDir data/leveldb/shstMetadata \
# 		--clean
# 
# load_sharedstreets_tiles_into_leveldb: data/leveldb/shstGeometry data/leveldb/shstReference data/leveldb/shstMetadata
# 
# data/leveldb/shstMatchedNpmrds:
# 	./bin/data_loading_leveldb/loadSharedStreetsMatchedNPMRDS \
# 		--shstMatchedDir ./data/sharedstreets/shst_matched_npmrds \
# 		--leveldbDir ./data/leveldb/shstMatchedNpmrds \
# 		--clean
# 
# data/leveldb/shstMatchedRis:
# 	./bin/data_loading_leveldb/loadSharedStreetsMatchedRIS \
# 		--shstMatchedDir ./data/sharedstreets/shst_matched_ris \
# 		--leveldbDir ./data/leveldb/shstMatchedRis \
# 		--clean
# 
# # https://wiki.openstreetmap.org/wiki/Osmosis/Detailed_Usage_0.47#--used-node_.28--un.29
# #   Restricts output of nodes to those that are used in ways and relations.
# data/osm/new-york-181224.osm:
# 	@osmosis --read-pbf file=data/osm/new-york-181224.osm.pbf --used-node --write-xml file=new-york-181224.osm
# 
# load_sharedstreets_match_output: data/leveldb/shstMatchedNpmrds data/leveldb/shstMatchedRis
# 
# load_osm_into_leveldb: data/osm/new-york-181224.osm
# 	@./bin/data_loading_leveldb/loadOSM \
# 		--osmFile ./data/osm/new-york-181224.osm \
# 		--dbsParentDir ./data/leveldb/ \
# 		--clean
