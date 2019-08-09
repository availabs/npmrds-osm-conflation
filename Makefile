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

data/npmrds/county_geojson:
	@./bin/data_transforming/createNpmrdsCountyGeoJSONs \
		--tmcIdentificationFile data/npmrds/TMC_Identification.csv \
		--npmrdsShapefileZipFile data/npmrds/inrix_expanded.zip \
		--outDir data/npmrds/county_geojson

data/npmrds/county_geojson_partitions: data/npmrds/county_geojson
	@./bin/data_partitioning/partitionCountyGeoJSONsByBoundingBoxes \
		./data/npmrds/county_geojson \
		./data/npmrds/county_geojson_partitions

data/ris/county_geojson:
	@./bin/data_transforming/createRisCountyGeoJSONs \
		--risGeodatabaseZip ./data/ris/RISDuplicate.gdb.zip \
		--outDir data/ris/county_geojson

data/ris/county_geojson_partitions: data/ris/county_geojson
	@./bin/data_partitioning/partitionCountyGeoJSONsByBoundingBoxes \
		./data/ris/county_geojson \
		./data/ris/county_geojson_partitions


