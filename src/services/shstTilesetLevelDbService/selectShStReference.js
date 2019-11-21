const _ = require('lodash');

// The terminal intersections are the same
const sameIntersections = (a, b) =>
  a.properties.fromIntersectionId === b.properties.fromIntersectionId &&
  a.properties.toIntersectionId === b.properties.toIntersectionId;

const selectShStReference = shstRefCandidates => {
  let selected = _.head(shstRefCandidates);
  const remainingCandidates = _.tail(shstRefCandidates);

  for (let i = 0; i < remainingCandidates.length; ++i) {
    const curCandidate = remainingCandidates[i];

    // Prefer original geometries to ones we created by reversing
    if (selected.properties.reversed && !curCandidate.properties.reversed) {
      selected = curCandidate;
    } else if (sameIntersections(selected, curCandidate)) {
      // choose the geometry with the higher resolution
      if (
        selected.geometry.coordinates.length <
        curCandidate.geometry.coordinates.length
      ) {
        selected = curCandidate;
      }
    } else {
      // Cannot pick, so throw
      const a = JSON.stringify(selected, null, 4);
      const b = JSON.stringify(curCandidate, null, 4);
      const msg = `INVARIANT BROKEN: reference refers to different road segments\n${a}\n${b}`;
      throw new Error(msg);
    }
  }

  return selected;
};

module.exports = selectShStReference;
