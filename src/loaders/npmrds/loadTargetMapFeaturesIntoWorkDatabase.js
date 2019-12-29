const assert = require('assert');

const _ = require('lodash');

const { isSomething } = require('../../utils/helpers');

const loadFeaturesFromGZippedNDSJON = require('../loadFeaturesFromGZippedNDSJON');

const nysFipsCodes = require('../nysFipsCodes.json');
const nysRegionCodes = require('../nysRegionCodes.json');

const UNDEFINED_FSYSTEM_RANK = 10;

const getMesoId = ({ tmc, tmclinear, lineartmc, targetMapCountyCode }) => {
  if (isSomething(tmclinear) && isSomething(lineartmc)) {
    assert(lineartmc.match(new RegExp(`${tmclinear}$`)));
  }

  if (isSomething(tmclinear)) {
    return `${targetMapCountyCode}|${tmclinear}`;
  }

  const prefixRE = new RegExp(`${tmc.slice(0, 3)}0{0,}`);
  const synthTmclinear = isSomething(lineartmc)
    ? lineartmc.replace(prefixRE, '')
    : null;

  return synthTmclinear && `${targetMapCountyCode}|${synthTmclinear}`;
};

const numOrNull = v => (_.isNil(v) || !Number.isFinite(+v) ? null : +v);

const normalizedDirNames = {
  NORTHBOUND: 'NORTHBOUND',
  N: 'NORTHBOUND',
  EASTBOUND: 'EASTBOUND',
  E: 'EASTBOUND',
  SOUTHBOUND: 'SOUTHBOUND',
  S: 'SOUTHBOUND',
  WESTBOUND: 'WESTBOUND',
  W: 'WESTBOUND'
};

const getTargetMapProperties = feature => {
  const {
    properties: {
      tmc,
      tmclinear,
      lineartmc,
      roadnumber,
      isprimary,
      f_system,
      county
    }
  } = feature;

  const countyName = county
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s{1,}/g, '_');

  const targetMapCountyCode = nysFipsCodes[countyName];
  const targetMapRegionCode = nysRegionCodes[countyName];

  if (!targetMapCountyCode) {
    throw new Error(`Unrecognized countyName: ${countyName}`);
  }

  const targetMapId = tmc;

  const targetMapMesoId = getMesoId({
    tmc,
    tmclinear,
    lineartmc,
    targetMapCountyCode
  });

  const targetMapMacroId = isSomething(roadnumber)
    ? `${targetMapRegionCode}|${roadnumber}`
    : null;

  const targetMapMegaId = isSomething(roadnumber) ? `${roadnumber}` : null;
  const targetMapIsPrimary = isSomething(isprimary) ? !!isprimary : true;
  const targetMapNetHrchyRank = isSomething(f_system)
    ? +f_system
    : UNDEFINED_FSYSTEM_RANK;

  return {
    targetMapId,
    targetMapMesoId,
    targetMapMacroId,
    targetMapMegaId,
    targetMapIsPrimary,
    targetMapNetHrchyRank,
    targetMapCountyCode,
    targetMapRegionCode
  };
};

const propertyTransforms = feature => {
  const {
    properties: { direction }
  } = feature;

  const normalizedStrProps = {
    direction: normalizedDirNames[_.upperCase(direction).trim()] || null
  };

  const normalizedNumProps = _(feature.properties)
    .pick([
      'start_latitude',
      'start_longitude',
      'end_latitude',
      'end_longitude',
      'road_order',
      'f_system',
      'faciltype',
      'structype',
      'thrulanes',
      'route_numb',
      'route_sign',
      'route_qual',
      'aadt',
      'aadt_singl',
      'aadt_combi',
      'nhs',
      'nhs_pct',
      'strhnt_typ',
      'strhnt_pct',
      'truck',
      'isprimary'
    ])
    .mapValues(numOrNull)
    .value();

  const normalizedProps = { ...normalizedStrProps, ...normalizedNumProps };

  return normalizedProps;
};

const loadTargetMapFeatures = (dbService, filePath) =>
  loadFeaturesFromGZippedNDSJON({
    dbService,
    filePath,
    getTargetMapProperties,
    propertyTransforms
  });

module.exports = loadTargetMapFeatures;
