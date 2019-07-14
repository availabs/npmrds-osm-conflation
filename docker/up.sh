#!/bin/bash

set -e
set -a

pushd "$( dirname "${BASH_SOURCE[0]}")" >/dev/null

. .env

docker-compose up osm_pgrouting 

popd >/dev/null
