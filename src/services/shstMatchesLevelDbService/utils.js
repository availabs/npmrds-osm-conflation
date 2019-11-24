const _ = require('lodash');

const getFeatureId = feature => {
  const {
    properties: { shstReferenceId, gisSegmentIndex, targetMapId }
  } = feature;

  if (
    _.isNil(shstReferenceId) ||
    _.isNil(gisSegmentIndex) ||
    _.isNil(targetMapId)
  ) {
    throw new Error(
      'ERROR: shstMatches features MUST have shstReferenceId, gisSegmentIndex, and targetMapId properties.'
    );
  }

  return `${shstReferenceId}##${gisSegmentIndex}##${targetMapId}`;
};

const getShStRefIdFeatureId = featureId =>
  _(featureId)
    .split('##')
    .first();

const getIteratorQueryForFeatureId = shstReferenceId => ({
  gt: shstReferenceId,
  lt: `${shstReferenceId}~`
});

const validateTargetMapParam = targetMap => {
  if (_.isNil(targetMap)) {
    throw new Error('targetMap parameter is required');
  }

  if (!/^[A-Z0-9_]{1,}$/i.test(`${targetMap}`)) {
    throw new Error('Valid targetMap name characters are A-Z, a-z, 0-9, and _');
  }

  return true;
};

module.exports = {
  getFeatureId,
  getShStRefIdFeatureId,
  getIteratorQueryForFeatureId,
  validateTargetMapParam
};
