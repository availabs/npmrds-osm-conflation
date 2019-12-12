const getTargetMapFeatureId = ({ properties: { tmc: id } }) => id;

const getMatchedFeatureId = ({ properties: { pp_tmc: id } }) => id;

module.exports = {
  getTargetMapFeatureId,
  getMatchedFeatureId
};
