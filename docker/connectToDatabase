#!/bin/bash 

set -e
set -a

. ./.env

export PGUSER="$POSTGRES_USER"
export PGPASSWORD="$POSTGRES_PASSWORD"
export PGPORT="$POSTGRES_PORT"
export PGHOST=127.0.0.1

psql
