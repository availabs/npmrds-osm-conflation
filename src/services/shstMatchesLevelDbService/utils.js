const _ = require('lodash');

const getFeatureId = feature => {
  const {
    properties: { shstReferenceId, gisSegmentIndex, data_source_id }
  } = feature;

  if (
    _.isNil(shstReferenceId) ||
    _.isNil(gisSegmentIndex) ||
    _.isNil(data_source_id)
  ) {
    throw new Error(
      'ERROR: shstMatches features MUST have shstReferenceId, gisSegmentIndex, and data_source_id properties.'
    );
  }

  return `${shstReferenceId}##${gisSegmentIndex}##${data_source_id}`;
};

const getShStRefIdFeatureId = featureId =>
  _(featureId)
    .split('##')
    .first();

const validateYearParam = year => {
  if (_.isNil(year)) {
    throw new Error('year parameter is required.');
  }

  if (!/^\d{4}$/.test(`${year}`)) {
    throw new Error('year parameter must be a four digit integer.');
  }

  return true;
};

const validateDataSourceParam = dataSource => {
  if (_.isNil(dataSource)) {
    throw new Error('dataSource parameter is required');
  }

  if (!/^[A-Z0-9_]{1,}$/i.test(`${dataSource}`)) {
    throw new Error(
      'Valid dataSource name characters are A-Z, a-z, 0-9, and _'
    );
  }

  return true;
};

module.exports = {
  getFeatureId,
  getShStRefIdFeatureId,
  validateYearParam,
  validateDataSourceParam
};
