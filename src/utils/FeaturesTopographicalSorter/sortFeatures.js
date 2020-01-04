/* eslint no-labels: 0, no-continue: 0, no-restricted-syntax: 0, no-constant-condition: 0 */

const _ = require('lodash');
const { isSomething } = require('../../utils/helpers');

const ERROR_CODES = require('./ERROR_CODES');

const COORD_PRECISION = 5;

const transformShstMatchFeaturesToEdgeInfoObjects = shstMatchFeatures => {
  const edgeInfo = shstMatchFeatures.reduce((acc, feature) => {
    const {
      id,
      properties: { shstFromIntersectionId, shstToIntersectionId }
    } = feature;

    const fromNodeId = shstFromIntersectionId;
    const toNodeId = shstToIntersectionId;

    acc.push({ id, fromNodeId, toNodeId });

    return acc;
  }, []);

  return edgeInfo;
};

const transformSpatialFeaturesToEdgeInfoObjects = features => {
  const nodeIdsByCoords = {};
  let nodeIdSeq = 0;

  const edgeInfo = features.reduce((acc, feature) => {
    const {
      id,
      geometry: { coordinates }
    } = feature;

    const [fromLon, fromLat] = _.first(coordinates);
    const [toLon, toLat] = _.last(coordinates);

    const fromCoord = `${_.round(fromLon, COORD_PRECISION)}|${_.round(
      fromLat,
      COORD_PRECISION
    )}`;

    const toCoord = `${_.round(toLon, COORD_PRECISION)}|${_.round(
      toLat,
      COORD_PRECISION
    )}`;

    const fromNodeId =
      nodeIdsByCoords[fromCoord] || (nodeIdsByCoords[fromCoord] = ++nodeIdSeq);
    const toNodeId =
      nodeIdsByCoords[toCoord] || (nodeIdsByCoords[toCoord] = ++nodeIdSeq);

    acc.push({ id, fromNodeId, toNodeId });

    return acc;
  }, []);

  return edgeInfo;
};

const transformFeaturesToEdgeInfoObjects = features => {
  if (
    features.every(
      ({ id, fromNodeId, toNodeId }) =>
        isSomething(id) && isSomething(fromNodeId) && isSomething(toNodeId)
    )
  ) {
    return features;
  }

  if (
    features.every(
      ({ properties: { shstFromIntersectionId, shstToIntersectionId } }) =>
        isSomething(shstFromIntersectionId) || isSomething(shstToIntersectionId)
    )
  ) {
    return transformShstMatchFeaturesToEdgeInfoObjects(features);
  }

  return transformSpatialFeaturesToEdgeInfoObjects(features);
};

const areSameEdge = (a, b) => a.id === b.id;

const areOppositeDirectionEdges = (a, b) =>
  a.fromNodeId === b.toNodeId && a.toNodeId === b.fromNodeId;

const isOutboundEdge = (a, b) => a.toNodeId === b.fromNodeId && a.id !== b.id;

const notSameOrOpposite = (a, b) =>
  !(areSameEdge(a, b) || areOppositeDirectionEdges(a, b));

// Return all possible chains. Let the caller choose the optimal one(s).
const sortFeatures = (bidirectional = true, features) => {
  if (_.isNil(features)) {
    return null;
  }
  if (!Array.isArray(features)) {
    throw new Error('features must be an array.');
  }
  if (features.length === 0) {
    return null;
  }

  const edgeInfo = transformFeaturesToEdgeInfoObjects(features);

  const sources = edgeInfo.filter(candidateSourceEdge =>
    edgeInfo.every(
      otherEdge =>
        areOppositeDirectionEdges(candidateSourceEdge, otherEdge) ||
        !isOutboundEdge(otherEdge, candidateSourceEdge)
    )
  );

  if (sources.length === 0) {
    // console.log(JSON.stringify({ bidirectional, edgeInfo, sources }, null, 4));

    const error = new Error(
      'Unable to determine source nodes for shstReference chains.'
    );
    error.code = ERROR_CODES.ERR_NO_SOURCE_NODES;
    throw error;
  } else if (!bidirectional && sources.length > 1) {
    // console.log(JSON.stringify({ bidirectional, edgeInfo, sources }, null, 4));

    const error = new Error('Number of sources exceeds 1.');
    error.code = ERROR_CODES.ERR_NUM_SOURCE_NODES_EXCEEDS_1;
    throw error;
  } else if (bidirectional && sources.length > 2) {
    // console.log(JSON.stringify({ bidirectional, edgeInfo, sources }, null, 4));

    const error = new Error('Number of sources exceeds 2.');
    error.code = ERROR_CODES.ERR_NUM_SOURCE_NODES_EXCEEDS_2;
    throw error;
  }

  const chains = sources.map(source => [source]);

  for (let i = 0; i < chains.length; ++i) {
    const chain = chains[i];

    // Filter out edges already in the chain and those edges' opposite direction pairs.
    let candidateOutboundEdges = edgeInfo.filter(candidate =>
      chain.every(notSameOrOpposite.bind(null, candidate))
    );

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const fromEdge = _.last(chain);

      const outboundEdges = candidateOutboundEdges.filter(candidate =>
        isOutboundEdge(fromEdge, candidate)
      );

      const outboundEdge = outboundEdges.pop();

      // No further for this chain
      if (!outboundEdge) {
        break;
      }

      // fork the chain if there was more than one outbound edge
      if (outboundEdges.length) {
        for (let j = 0; j < outboundEdges.length; ++j) {
          const outE = outboundEdges[j];

          const chainClone = chain.slice();
          chainClone.push(outE);
          chains.push(chainClone);
        }
      }

      chain.push(outboundEdge);

      candidateOutboundEdges = candidateOutboundEdges.filter(
        notSameOrOpposite.bind(null, outboundEdge)
      );
    }
  }

  const featuresById = features.reduce((acc, feature) => {
    const { id } = feature;
    acc[id] = feature;
    return acc;
  }, {});

  if (!bidirectional) {
    if (chains.length !== 1) {
      const error = new Error('Number of output chains exceeds 1.');
      error.code = ERROR_CODES.ERR_NUM_CHAINS_EXCEEDS_1;
      throw error;
    }
    const [chain] = chains;
    return chain.map(({ id }) => featuresById[id]);
  }

  if (chains.length > 2) {
    const error = new Error('Number of output chains exceeds 2.');
    error.code = ERROR_CODES.ERR_NUM_CHAINS_EXCEEDS_2;
    throw error;
  }

  // remove chains that are subchains of other chains, in terms of network role
  const filteredChains = chains
    .sort((a, b) => a.length - b.length)
    .filter(
      (chain, i, arr) =>
        !arr.slice(i + 1).some(otherChain => {
          let m = 0;
          let n = 0;

          while (true) {
            const { fromNodeId: curFrom, toNodeId: curTo } = chain[m];
            const { fromNodeId: otherFrom, toNodeId: otherTo } = otherChain[
              n++
            ];

            if (curFrom === otherFrom && curTo === otherTo) {
              ++m;
            }

            // For every chain member, the above condition was true.
            if (m === chain.length) {
              return true;
            }

            // We reached the end of the otherChain without matching every chain member.
            if (n === otherChain.length) {
              return false;
            }
          }
        })
    );

  return filteredChains.map(chain => chain.map(({ id }) => featuresById[id]));
};

module.exports = sortFeatures;
