# npmrds-osm-conflation

NPMRDS/OSM Conflation via SharedStreets

## Setup

```bash
npm install
sudo apt-get install sqlite3 libsqlite3-dev jq gdal-bin
```

## Optional Postprocessing Setup

Dependencies for postprocessing the conflation map.

* [tippecanoe](https://github.com/mapbox/tippecanoe#installation)
* [osmosis](https://wiki.openstreetmap.org/wiki/Osmosis/Installation)

## Creating a temporary in-memory filesystem

Currently, there are no optimizations when writing to the SQLite databases.
The services currently syncronously write one feature at a time to SQLite.
This is extremely slow. To speed up writes, you can create a temporary 
  in-memory directory.

NOTE: Currently, source code changes are needed to point the SQLite Services to this temporary directory.
  Future support for ENV variable configurations will happen, when time permits.

To create a temporary in-memory directory:
```bash
sudo mount -t tmpfs -o size=96G conflation_tmp_sqlite /home/avail/code/npmrds-osm-conflation/tmpsqlite
```

Additionally, you can set the TMPDIR to the in-memory data directory to speed up matching:

```
time \
	SQLITE_TMPDIR=/home/avail/code/npmrds-osm-conflation/tmpsqlite/sqlite_tmpdir/ \
	TMPDIR=/home/avail/code/npmrds-osm-conflation/tmpsqlite/sqlite_tmpdir/ \
	./src/conflation/run &>> conflation.log
```
