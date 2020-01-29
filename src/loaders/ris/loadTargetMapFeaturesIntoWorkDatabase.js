/* eslint no-param-reassign: 0 */

// TODO: Write the following assertion
// ogr2ogr -f CSV /vsistdout/ 2019 -sql 'SELECT count(fid) FROM RIS_2019 where fid = (objectid -1)'

const _ = require('lodash');

const loadFeaturesFromGZippedNDSJON = require('../loadFeaturesFromGZippedNDSJON');

const getTargetMapFeatureBearing = require('../getTargetMapFeatureBearing');

const nysFipsCodes = require('../nysFipsCodes.json');

const UNDEFINED_FSYSTEM_RANK = 10;

const normalizedDirNames = {
  1: 1,
  2: 2,
  P: 1,
  R: 2
};

const makeGetTargetMapProperties = targetMap => feature => {
  const {
    properties: {
      objectid,
      region,
      county_nam,
      fips_co,
      dot_id,
      gis_id,
      beg_mp,
      overlap_hi,
      functional
    }
  } = feature;

  feature.properties.fid = +objectid - 1;

  if (!(dot_id && gis_id && fips_co && Number.isFinite(beg_mp) && county_nam)) {
    throw new Error('RIS feature lacks properties necessary to create an ID.');
  }

  // FID = OBJECTID - 1
  const targetMapId = feature.properties.fid;

  if (!Number.isFinite(targetMapId)) {
    throw new Error(
      `INVARIANT BROKEN: objectid (${objectid}) is not an integer.`
    );
  }

  const countyName = county_nam
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s{1,}/g, '_');

  const targetMapCountyCode = nysFipsCodes[countyName];
  const targetMapRegionCode = _.padStart(region, 2, '0');

  if (!targetMapCountyCode) {
    throw new Error(`Unrecognized countyName: ${countyName}`);
  }

  const targetMapMesoId = `${targetMapCountyCode}|${gis_id}`;
  const targetMapMacroId = gis_id;
  const targetMapMegaId = dot_id;
  const targetMapIsPrimary = !(overlap_hi > 1);
  const targetMapNetHrchyRank = Number.isFinite(+functional)
    ? +functional % 10
    : UNDEFINED_FSYSTEM_RANK;

  const targetMapMicroLevelBearing = getTargetMapFeatureBearing(feature);

  return {
    targetMap,
    targetMapId,
    targetMapMesoId,
    targetMapMacroId,
    targetMapMegaId,
    targetMapIsPrimary,
    targetMapNetHrchyRank,
    targetMapCountyCode,
    targetMapRegionCode,
    targetMapMicroLevelBearing,
    targetMapMesoLevelIdx: null,
    targetMapMesoLevelSortMethod: null,
    targetMapMesoLevelBearing: null
  };
};

const propertyTransforms = feature => {
  const {
    properties: { direction }
  } = feature;

  const normalizedProps = {
    direction: normalizedDirNames[_.upperCase(direction).trim()] || null
  };

  return normalizedProps;
};

const loadTargetMapFeatures = (targetMap, dbService, filePath) =>
  loadFeaturesFromGZippedNDSJON({
    dbService,
    filePath,
    getTargetMapProperties: makeGetTargetMapProperties(targetMap),
    propertyTransforms
  });

module.exports = loadTargetMapFeatures;
