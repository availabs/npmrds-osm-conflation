const ERROR_CODES = require('./ERROR_CODES');

const sortFeatures = require('./sortFeatures');

const createTopoSortedChain = sortFeatures.bind(null, false);
const createTopoSortedChains = sortFeatures.bind(null, true);

module.exports = {
  ERROR_CODES,
  createTopoSortedChain,
  createTopoSortedChains
};
