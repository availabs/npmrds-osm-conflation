# NPMRDS/OSM/RIS Conflation

Currently this repository is a collection of problem solutions held together with duct tape and bailing wire.

## Creating a shapefile from the output NDJSON

The [createConflationShapefile](bin/data_transforming/createConflationShapefile) script transforms NDJSON into Esri Shapefiles.

It takes two positional CLI arguments:

1. the conflation output NDJSON file
2. the output directory path 

USAGE:
```
./bin/data_transforming/createConflationShapefile conflation.ndjson conflation_shapefile
```
## network_level property in output

This field refers to the SharedStreets roadClass. See the sharedstreets-js [roadClassConverter](https://github.com/sharedstreets/sharedstreets-js/blob/e159a1bb9e361e1e4f1dd3032d3ed6334465ad08/src/point_matcher.ts#L53-L73) function.
