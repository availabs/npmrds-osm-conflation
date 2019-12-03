/* eslint no-underscore-dangle: 0 */

const _ = require('lodash');

const getShstReferenceChains = shstNetEdgesParam => {
  console.error(JSON.stringify(shstNetEdgesParam, null, 4));
  if (_.isNil(shstNetEdgesParam)) {
    return null;
  }

  if (!Array.isArray(shstNetEdgesParam)) {
    throw new Error('shstNetEdgesParam must be an array.');
  }

  if (shstNetEdgesParam.length === 0) {
    return null;
  }

  if (shstNetEdgesParam.length === 1) {
    const [{ shstReferenceId }] = shstNetEdgesParam;
    return [[shstReferenceId]];
  }

  const sources = shstNetEdgesParam.filter(edge =>
    shstNetEdgesParam.every(otherEdge => {
      const reversedEdges =
        edge.shstFromIntersectionId === otherEdge.shstToIntersectionId &&
        edge.shstToIntersectionId === otherEdge.shstFromIntersectionId;

      // reversed edges do not count as "inbound" edges
      if (reversedEdges) {
        return true;
      }

      const otherEdgeIsInbound =
        edge.shstFromIntersectionId === otherEdge.shstToIntersectionId;

      return !otherEdgeIsInbound;
    })
  );

  console.error(JSON.stringify({ sources }, null, 4));

  if (sources.length === 0) {
    throw new Error(
      'Unable to determine source nodes for shstReference chains.'
    );
  }

  if (sources.length > 2) {
    throw new Error('shstNetEdges are not connected.');
  }

  let curRefNetInfo;

  const findOutbound = e =>
    curRefNetInfo.shstToIntersectionId === e.shstFromIntersectionId &&
    e.shstReferenceId !== curRefNetInfo.shstReferenceId;

  const findOppositeDirectionEdge = e =>
    e.shstFromIntersectionId === curRefNetInfo.shstToIntersectionId &&
    e.shstToIntersectionId === curRefNetInfo.shstFromIntersectionId;

  const chains = [];

  for (let i = 0; i < sources.length; ++i) {
    const sourceEdgeInfo = sources[i];

    const _shstNetEdges = shstNetEdgesParam.slice();

    const curRefNetInfoIdx = _shstNetEdges.findIndex(
      e => e.shstReferenceId === sourceEdgeInfo.shstReferenceId
    );

    // console.log(sourceEdgeInfo.shstReferenceId, curRefNetInfoIdx);

    [curRefNetInfo] = _shstNetEdges.splice(curRefNetInfoIdx, 1);

    // console.log(curRefNetInfo.shstReferenceId);
    const chain = [];

    // eslint-disable-next-line no-constant-condition
    while (true) {
      chain.push(curRefNetInfo.shstReferenceId);

      // Remove the reversed direction edge from consideration.
      const oppositeDirIdx = _shstNetEdges.findIndex(findOppositeDirectionEdge);
      if (oppositeDirIdx >= 0) {
        _shstNetEdges.splice(oppositeDirIdx, 1);
      }

      const outboundEdgeIdx = _shstNetEdges.findIndex(findOutbound);

      const outboundRefNetInfo =
        outboundEdgeIdx > -1
          ? _.first(_shstNetEdges.splice(outboundEdgeIdx, 1))
          : null;

      if (outboundRefNetInfo) {
        curRefNetInfo = outboundRefNetInfo;
      } else {
        break;
      }
    }

    // console.error(JSON.stringify(chain, null, 4));
    chains.push(chain);
  }

  return chains;
};

module.exports = getShstReferenceChains;
