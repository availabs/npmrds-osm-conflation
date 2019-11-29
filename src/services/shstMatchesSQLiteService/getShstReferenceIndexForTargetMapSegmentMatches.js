const assert = require('assert');

const getShstReferenceIndexForTargetMapSegmentMatches = (
  shstNetEdgesParam,
  shstReferenceId
) => {
  const shstNetEdges = shstNetEdgesParam.slice();

  const curRefNetInfoIdx = shstNetEdges.findIndex(
    e => e.shstReferenceId === shstReferenceId
  );

  if (curRefNetInfoIdx < 0) {
    throw new Error('ERROR: shstReferenceId not in the shstNetEdges');
  }

  let [curRefNetInfo] = shstNetEdges.splice(curRefNetInfoIdx, 1);

  let idx = 0;

  const findInbound = e =>
    e.shstToIntersectionId === curRefNetInfo.shstFromIntersectionId &&
    e.shstReferenceId !== shstReferenceId;

  const findOppositeDirectionEdge = e =>
    e.shstFromIntersectionId === curRefNetInfo.shstToIntersectionId &&
    e.shstToIntersectionId === curRefNetInfo.shstFromIntersectionId;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const oppositeDirIdx = shstNetEdges.findIndex(findOppositeDirectionEdge);

    if (oppositeDirIdx >= 0) {
      shstNetEdges.splice(oppositeDirIdx, 1);
    }

    const inboundRefNetInfo = shstNetEdges.find(findInbound);

    if (inboundRefNetInfo) {
      ++idx;
      assert(idx < shstNetEdgesParam.length);
      curRefNetInfo = inboundRefNetInfo;
    } else {
      break;
    }
  }

  return idx;
};

module.exports = getShstReferenceIndexForTargetMapSegmentMatches;
