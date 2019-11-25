const _ = require('lodash');

const validateShstReferenceSplitting = ({
  shstReferenceAuxProperties,
  shstReferencePartitions
}) => {
  const { osmNodeIdsSeq } = shstReferenceAuxProperties;

  // Validate the osmMetadata nodeIds.
  //   Downsteam processing depends on their connectedness and completeness.
  const outputNodeIdChains = _(shstReferencePartitions)
    .sortBy(['segmentIndex'])
    .map('properties.osmMetadata.waySection.nodeIds')
    .value();

  // INVARIANT: Chains are connected
  if (outputNodeIdChains.length > 1) {
    for (let i = 1; i < outputNodeIdChains.length; ++i) {
      const prev = outputNodeIdChains[i - 1];
      const cur = outputNodeIdChains[i];

      if (_.last(prev) !== _.first(cur)) {
        throw new Error(
          'ERROR: INVARIANT BROKEN. Split segments nodeId chains are not connected.'
        );
      }
    }
  }

  const outputNodeIdsSeq = _.flatten(outputNodeIdChains).reduce(
    (acc, nodeId) => {
      if (nodeId !== null && nodeId !== _.last(acc)) {
        acc.push(nodeId);
      }
      return acc;
    },
    []
  );

  if (!_.isEqual(osmNodeIdsSeq, outputNodeIdsSeq)) {
    console.error('*'.repeat(40));
    console.error(
      JSON.stringify(
        {
          'in-out': _.difference(osmNodeIdsSeq, outputNodeIdsSeq),
          'out-in': _.difference(outputNodeIdsSeq, osmNodeIdsSeq)
        },
        null,
        4
      )
    );
    console.error(osmNodeIdsSeq.length, outputNodeIdsSeq.length);
    console.error(
      JSON.stringify(
        { inputNodeIdsSeq: osmNodeIdsSeq, outputNodeIdsSeq },
        null,
        4
      )
    );
    throw new Error(
      'ERROR: INVARIANT BROKEN. Output osmNodeIdsSeq !== Input osmNodeIdsSeq.'
    );
  }
};

module.exports = validateShstReferenceSplitting;
