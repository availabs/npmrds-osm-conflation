# NPMRDS/OSM/RIS Conflation

Currently this repository is a collection of problem solutions held together with duct tape and bailing wire.

## Creating a shapefile from the output NDJSON

The `bin/data_transforming/createConflationShapefile` script transforms NDJSON into Esri Shapefiles.

It takes two positional CLI arguments:

1. the conflation output NDJSON file
2. the output directory path 

USAGE:
```
./bin/data_transforming/createConflationShapefile conflation.ndjson conflation_shapefile
```
