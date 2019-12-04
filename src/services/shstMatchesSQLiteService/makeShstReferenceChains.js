/* eslint no-underscore-dangle: 0 */

const _ = require('lodash');

const areSameEdge = (a, b) => a.shstReferenceId === b.shstReferenceId;

const areOppositeDirectionEdges = (a, b) =>
  a.shstFromIntersectionId === b.shstToIntersectionId &&
  a.shstToIntersectionId === b.shstFromIntersectionId;

const isOutboundEdge = (a, b) =>
  a.shstToIntersectionId === b.shstFromIntersectionId &&
  a.shstReferenceId !== b.shstReferenceId;

const notSameOrOpposite = (a, b) =>
  !(areSameEdge(a, b) || areOppositeDirectionEdges(a, b));

// Return all possible chains. Let the caller choose the optimal one(s).
const getShstReferenceChains = shstNetEdges => {
  // console.error(JSON.stringify(shstNetEdges, null, 4));
  if (_.isNil(shstNetEdges)) {
    return null;
  }

  if (!Array.isArray(shstNetEdges)) {
    throw new Error('shstNetEdges must be an array.');
  }

  if (shstNetEdges.length === 0) {
    return null;
  }

  if (shstNetEdges.length === 1) {
    const [{ shstReferenceId }] = shstNetEdges;
    return [[shstReferenceId]];
  }

  const sources = shstNetEdges.filter(candidateSourceEdge =>
    shstNetEdges.every(otherEdge => {
      const oppositeDir = areOppositeDirectionEdges(
        candidateSourceEdge,
        otherEdge
      );

      // opposite direction pair does not count as "inbound" edge
      if (oppositeDir) {
        return true;
      }

      const edgeIsOutboundOfOther = isOutboundEdge(
        otherEdge,
        candidateSourceEdge
      );

      return !edgeIsOutboundOfOther;
    })
  );

  if (sources.length === 0) {
    throw new Error(
      'Unable to determine source nodes for shstReference chains.'
    );
  }

  if (sources.length > 2) {
    throw new Error('shstNetEdges are not connected.');
  }

  const chains = sources.map(source => [source]);

  for (let i = 0; i < chains.length; ++i) {
    const chain = chains[i];

    let candidateOutboundEdges = shstNetEdges.filter(candidate =>
      // Filter out edges already in the chain and those edges' opposite direction pairs.
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

  return chains.map(chain =>
    chain.map(({ shstReferenceId }) => shstReferenceId)
  );
};

module.exports = getShstReferenceChains;

// test that no two edges have the same from and to intersections
// for (let i = 0; i < shstNetEdges.length; ++i) {
// const edgeInfo = shstNetEdges[i]

// for (let j = i+1; j < shstNetEdges.length; ++j) {
// const otherEdge = shstNetEdges[j]

// const sameFrom= edgeInfo.shstFromIntersectionId === otherEdge.shstFromIntersectionId
// const sameTo = edgeInfo.shstToIntersectionId === otherEdge.shstToIntersectionId

// if (sameFrom && sameTo) {
// // TODO: Figure out a way to support this.
// //       We want to select the one relevant to the targetMap segment matches.
// throw new Error('Two separate edges with same shstFromIntersectionId and shstToIntersectionId')
// }
// }
// }
