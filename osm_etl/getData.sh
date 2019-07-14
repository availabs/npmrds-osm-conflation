#!/bin/bash

set -e

cd "$( dirname "${BASH_SOURCE[0]}" )"

mkdir -p ../data

curl 'http://download.geofabrik.de/north-america/us/new-york-190101.osm.pbf' > ./data/new-york-190101.osm.pbf

curl 'https://raw.githubusercontent.com/pgRouting/osm2pgrouting/master/mapconfig.xml' > mapconfig.xml
curl 'https://raw.githubusercontent.com/pgRouting/osm2pgrouting/master/mapconfig.xml' > mapconfig.xml
curl 'https://raw.githubusercontent.com/pgRouting/osm2pgrouting/master/mapconfig_for_cars.xml' > mapconfig_for_cars.xml
