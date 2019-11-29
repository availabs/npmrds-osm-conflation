const _ = require('lodash');

const getFeatureId = feature => {
  const {
    properties: {
      shstReferenceId,
      targetMapId,
      shstFromIntersectionId,
      shstToIntersectionId
    }
  } = feature;

  if (
    _.isNil(shstReferenceId) ||
    _.isNil(targetMapId) ||
    _.isNil(shstFromIntersectionId) ||
    _.isNil(shstToIntersectionId)
  ) {
    throw new Error(
      'ERROR: shstMatches features MUST have shstReferenceId, targetMapId, shstFromIntersectionId, shstToIntersectionId properties.'
    );
  }

  return `${shstReferenceId}##${targetMapId}##${shstFromIntersectionId}##${shstToIntersectionId}`;
};

const getShStRefIdFeatureId = featureId =>
  _(featureId)
    .split('##')
    .first();

const getIteratorQueryForFeatureId = shstReferenceId => ({
  gt: `${shstReferenceId}`,
  lt: `${shstReferenceId}##~`
});

const getIteratorQueryForTargetMapId = targetMapId => ({
  gt: targetMapId,
  lt: `${targetMapId}##~`
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
  getIteratorQueryForTargetMapId,
  validateTargetMapParam
};

