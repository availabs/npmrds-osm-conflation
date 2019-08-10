# Use bash for sub-shells, allowing use of bash-specific functionality.
SHELL := /bin/bash

MKFILE_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

# https://www.gnu.org/software/make/manual/make.html#Special-Targets
# The targets which .SECONDARY depends on are treated as intermediate files,
# 	except that they are never automatically deleted. See Chains of Implicit Rules.
# 
# .SECONDARY with no prerequisites causes all targets to be treated as secondary
# 	(i.e., no target is removed because it is considered intermediate).
.SECONDARY:

node_modules:
	@npm install

lib/sharedstreets-builder-0.3.1.jar:
	@mkdir -p lib
	@wget --quiet --directory-prefix=lib \
		https://github.com/sharedstreets/sharedstreets-builder/releases/download/0.3.1/sharedstreets-builder-0.3.1.jar

init: node_modules lib/sharedstreets-builder-0.3.1.jar

data/npmrds/county_geojson: init
	@./bin/data_transforming/createNpmrdsCountyGeoJSONs \
		--tmcIdentificationFile data/npmrds/TMC_Identification.csv \
		--npmrdsShapefileZipFile data/npmrds/inrix_expanded.zip \
		--outDir data/npmrds/county_geojson

data/ris/county_geojson: init
	@./bin/data_transforming/createRisCountyGeoJSONs \
		--risGeodatabaseZip ./data/ris/RISDuplicate.gdb.zip \
		--outDir data/ris/county_geojson

data/npmrds/county_geojson_partitions: data/npmrds/county_geojson
	@./bin/data_partitioning/partitionCountyGeoJSONsByBoundingBoxes \
		./data/npmrds/county_geojson \
		./data/npmrds/county_geojson_partitions

data/ris/county_geojson_partitions: data/ris/county_geojson
	@./bin/data_partitioning/partitionCountyGeoJSONsByBoundingBoxes \
		./data/ris/county_geojson \
		./data/ris/county_geojson_partitions

data/sharedstreets/shst_matched_npmrds:
	./bin/data_processing/runSharedStreetsMatchOnNPMRDSPartitions \
		data/npmrds/county_geojson_partitions \
		data/sharedstreets/shst_matched_npmrds
		
data/sharedstreets/shst_matched_ris:
	./bin/data_processing/runSharedStreetsMatchOnRISPartitions \
		data/ris/county_geojson_partitions \
		data/sharedstreets/shst_matched_ris
		
sharedstreets_match: data/sharedstreets/shst_matched_npmrds data/sharedstreets/shst_matched_ris


