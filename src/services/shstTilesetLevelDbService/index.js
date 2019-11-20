#!/usr/bin/env node

/* eslint no-restricted-syntax: 0 */

const { mkdirSync } = require('fs');
const { join } = require('path');

const turfHelpers = require('@turf/helpers');
const _ = require('lodash');

const levelup = require('levelup');
const leveldown = require('leveldown');
const encode = require('encoding-down');
const sub = require('subleveldown');

const LEVELDB_DIR = join(__dirname, '../../../data/leveldb/');

const JSON_ENCODING = { valueEncoding: 'json' };

const GEOMETRY = 'geometry';
const INTERSECTION = 'intersection';
const METADATA = 'metadata';
const REFERENCE = 'reference';

const SHST_TILESET_LEVELDB_DIR = join(LEVELDB_DIR, 'shst_tileset');
const getLevelDbDir = () => SHST_TILESET_LEVELDB_DIR;
mkdirSync(getLevelDbDir(), { recursive: true });

const dbsByTileType = {};

const getGeometryDb = () => dbsByTileType[GEOMETRY];
const getIntersectionDb = () => dbsByTileType[INTERSECTION];
const getMetadataDb = () => dbsByTileType[METADATA];
const getReferenceDb = () => dbsByTileType[REFERENCE];

// Immediately Invoked Function Expression
(function dbInitializer() {
  const dir = getLevelDbDir();

  const db = levelup(encode(leveldown(dir), JSON_ENCODING));

  const geometrySubDb = sub(db, 'geometry', JSON_ENCODING);
  const intersectionSubDb = sub(db, 'intersection', JSON_ENCODING);
  const metadataSubDb = sub(db, 'metadata', JSON_ENCODING);
  const referenceSubDb = sub(db, 'reference', JSON_ENCODING);

  dbsByTileType[GEOMETRY] = geometrySubDb;
  dbsByTileType[INTERSECTION] = intersectionSubDb;
  dbsByTileType[METADATA] = metadataSubDb;
  dbsByTileType[REFERENCE] = referenceSubDb;
})();

// ========= GEOMETRY =========

/* https://github.com/sharedstreets/sharedstreets-ref-system#sharedstreets-geometries
Sample geometry tileMember
{
  "lonlats": [
    -74.45763500000001,
    42.764547,
    -74.457651,
    42.765702000000005
  ],
  "id": "8604d1918a739ed8984ad97f646393dd",
  "fromIntersectionId": "f497d58a52621d82f193c97db0d4cce0",
  "toIntersectionId": "e55592b572d7e988bc041873bd7b17b6",
  "forwardReferenceId": "705983ff5b9f6af4a1690609fe16b98a",
  "backReferenceId": "46f5668551cfcb53122d735a2e1d9f90",
  "roadClass": "Residential"
}
*/
const makeGeometryTileMembersBatchPutOperation = tileMember => {
  const {
    id,
    lonlats,
    fromIntersectionId,
    toIntersectionId,
    forwardReferenceId,
    backReferenceId,
    roadClass
  } = tileMember;

  const coords = _.chunk(lonlats, 2);

  const properties = {
    id,
    fromIntersectionId,
    toIntersectionId,
    forwardReferenceId,
    backReferenceId,
    roadClass
  };

  const feature = turfHelpers.lineString(coords, properties, { id });

  return {
    type: 'put',
    key: id,
    value: feature
  };
};

const putGeometryTileMembers = async ({ tileMembers }) => {
  if (!tileMembers) {
    return;
  }

  const db = getGeometryDb();

  const ops = Array.isArray(tileMembers)
    ? tileMembers.map(makeGeometryTileMembersBatchPutOperation)
    : [makeGeometryTileMembersBatchPutOperation(tileMembers)];

  try {
    await db.batch(ops);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

async function* makeGeometryTileMembersAsyncIterator(opts) {
  const db = getGeometryDb();

  for await (const feature of db.createValueStream(opts)) {
    yield feature;
  }
}

// ========= INTERSECTION =========

/* https://github.com/sharedstreets/sharedstreets-ref-system#sharedstreets-intersections
Sample intersection tileMember element
{
  "inboundReferenceIds": [
    "1110eb55fbfa7cb353284bb9ee69b049",
    "ed34477f288c8b7fe69ecedb8c850f28",
    "d3c71447eff2bb9e651ea1e301153ba3"
  ],
  "outboundReferenceIds": [
    "dd538039773d140f86d77a59bf48aa7e",
    "97346c7d6f25c5ccc09b7709ff1af066",
    "0167d091222683314eeccc4afd58ac0c"
  ],
  "id": "89310fb17ac3878df59c757547cbfc67",
  "nodeId": "212670541",
  "lon": -74.53068900000001,
  "lat": 42.805373
}
*/
const makeIntersectionTileMembersBatchPutOperation = tileMember => {
  const {
    id,
    inboundReferenceIds,
    outboundReferenceIds,
    nodeId,
    lon,
    lat
  } = tileMember;

  const coord = [lon, lat];

  const properties = {
    id,
    inboundReferenceIds,
    outboundReferenceIds,
    nodeId
  };

  const feature = turfHelpers.point(coord, properties, { id });

  return {
    type: 'put',
    key: id,
    value: feature
  };
};

const putIntersectionTileMembers = async ({ tileMembers }) => {
  if (!tileMembers) {
    return;
  }

  const db = getIntersectionDb();

  const ops = Array.isArray(tileMembers)
    ? tileMembers.map(makeIntersectionTileMembersBatchPutOperation)
    : [makeIntersectionTileMembersBatchPutOperation(tileMembers)];

  try {
    await db.batch(ops);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

async function* makeIntersectionTileMembersAsyncIterator(opts) {
  const db = getIntersectionDb();

  for await (const feature of db.createValueStream(opts)) {
    yield feature;
  }
}

// ========= METADATA =========

/* https://github.com/sharedstreets/sharedstreets-ref-system#sharedstreets-osm-metadata
Sample metadata tileMember element:
{
  "gisMetadata": [],
  "geometryId": "8604d1918a739ed8984ad97f646393dd",
  "osmMetadata": {
    "waySections": [
      {
        "nodeIds": [
          "213190480",
          "213190483"
        ],
        "wayId": "20159010",
        "roadClass": "Residential",
        "oneWay": false,
        "roundabout": false,
        "link": false,
        "name": ""
      }
    ],
    "name": ""
  }
}
*/
const makeMetadataTileMembersBatchPutOperation = tileMember => ({
  type: 'put',
  key: tileMember.geometryId,
  value: tileMember
});

const putMetadataTileMembers = async ({ tileMembers }) => {
  if (!tileMembers) {
    return;
  }

  const db = getMetadataDb();

  const ops = Array.isArray(tileMembers)
    ? tileMembers.map(makeMetadataTileMembersBatchPutOperation)
    : [makeMetadataTileMembersBatchPutOperation(tileMembers)];

  try {
    await db.batch(ops);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

async function* makeMetadataTileMembersAsyncIterator(opts) {
  const db = getMetadataDb();

  for await (const feature of db.createValueStream(opts)) {
    yield feature;
  }
}

// ========= REFERENCE =========

/* https://github.com/sharedstreets/sharedstreets-ref-system#sharedstreets-references
{
  "locationReferences": [
    {
      "intersectionId": "88519e79defc287dfa2a1ade9f1f4cb7",
      "lon": -79.720499,
      "lat": 42.281185,
      "outboundBearing": 330,
      "distanceToNextRef": 6838
    },
    {
      "intersectionId": "149d1592d7f7d5f6bc4b108a23e88787",
      "lon": -79.720957,
      "lat": 42.281695,
      "inboundBearing": 319
    }
  ],
  "id": "36bdf21f37181679263c0edf2fa6f05e",
  "geometryId": "5d9fd76c70f4b1b7c71a7f8845694157",
  "formOfWay": "Other"
}
*/
const makeReferenceTileMembersBatchPutOperation = tileMember => ({
  type: 'put',
  key: tileMember.id,
  value: tileMember
});

const putReferenceTileMembers = async ({ tileMembers }) => {
  if (!tileMembers) {
    return;
  }

  const db = getReferenceDb();

  const ops = Array.isArray(tileMembers)
    ? tileMembers.map(makeReferenceTileMembersBatchPutOperation)
    : [makeReferenceTileMembersBatchPutOperation(tileMembers)];

  try {
    await db.batch(ops);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

async function* makeReferenceTileMembersAsyncIterator(opts) {
  const db = getReferenceDb();

  for await (const feature of db.createValueStream(opts)) {
    yield feature;
  }
}

module.exports = {
  putGeometryTileMembers,
  makeGeometryTileMembersAsyncIterator,
  putIntersectionTileMembers,
  makeIntersectionTileMembersAsyncIterator,
  putMetadataTileMembers,
  makeMetadataTileMembersAsyncIterator,
  putReferenceTileMembers,
  makeReferenceTileMembersAsyncIterator
};
