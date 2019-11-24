const assert = require('assert');

const _ = require('lodash');

const SingleSourceMatchesEmitter = require('./SingleSourceMatchesEmitter');

const getActiveSingleSourceEmitters = readStreamsByTargetMap => {
  const activeSingleSourceEmitters = new Set();

  const targetMaps = Object.keys(readStreamsByTargetMap);
  for (let i = 0; i < targetMaps.length; ++i) {
    const targetMap = targetMaps[i];

    const stream = readStreamsByTargetMap[targetMap];

    const subMachine = new SingleSourceMatchesEmitter({
      targetMap,
      stream
    });

    activeSingleSourceEmitters.add(subMachine);
  }

  return activeSingleSourceEmitters;
};

class AggregatedShstReferenceMatchesAsyncIterator {
  constructor(readStreamsByTargetMap) {
    // Priority queue. Sorted by shstRefId.
    const queue = [];
    let aggregated = {};
    let curShstRefId = null;
    let resolveNext;
    let next;

    const resetNext = () => {
      next = new Promise(resolve => {
        resolveNext = resolve;
      });
    };
    // Initialize the next Promise
    resetNext();

    this[Symbol.asyncIterator] = async function* asyncIteratorFn() {
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const d = await next;
        if (d === null) {
          return;
        }

        yield d;
      }
    };

    const emitNext = () => {
      const d = Object.assign({}, aggregated);
      const oldResolver = resolveNext;
      resetNext();
      oldResolver(d);
    };

    const emitDone = () => {
      resolveNext(null);
    };

    const activeSingleSourceEmitters = getActiveSingleSourceEmitters(
      readStreamsByTargetMap
    );

    // If there aren't any data sources, we are done.
    if (activeSingleSourceEmitters.size === 0) {
      emitDone();
      return;
    }

    let awaitingSSEsCount = activeSingleSourceEmitters.size;

    const updateShStRefId = () => {
      try {
        curShstRefId = _.first(queue).shstRefId;
      } catch (err) {
        console.error(err);
      }
    };

    const clearAggregated = () => {
      aggregated = {};
    };

    const addDataToQueue = data => {
      queue.push(data);
      queue.sort(({ shstRefId: a }, { shstRefId: b }) => a.localeCompare(b));
    };

    const addDataToAggregated = data => {
      const { targetMap, shstRefId, matchFeature } = data;

      assert(shstRefId === curShstRefId);

      // Add this entry to the aggregated data
      aggregated[targetMap] = aggregated[targetMap] || [];
      aggregated[targetMap].push(matchFeature);
    };

    // Move queued entries with the curShstRefId to the aggregated.
    const moveCurShStRefQueuedDataToAggregated = () => {
      // Initialize the curShstRefId if it has not been yet
      if (queue.length && curShstRefId === null) {
        curShstRefId = _.first(queue).shstRefId;
      }
      while (queue.length) {
        // Get the head of the queue.
        const [data] = queue;

        // All entries for the curShstRefId have been handled.
        if (data.shstRefId !== curShstRefId) {
          return;
        }

        // Add this entry to the aggregated data
        addDataToAggregated(data);

        // Remove this entry from the queue
        queue.shift();

        // We are ready for more data from the SSE
        //   Before unpausing, we need to record that
        //   a data event from this SSE will be required before
        //   we can make any future decisions.
        ++awaitingSSEsCount;

        // Tell the SSE that we are ready for more data.
        data.unpauseSSE();
      }
    };

    const emitAggregated = () => {
      if (!_.isEmpty(aggregated)) {
        emitNext();
        clearAggregated();
      }
    };

    const handleNewDataForCurShStRef = data => {
      addDataToAggregated(data);

      // We are ready for more data from the SSE
      //   Before unpausing, we need to record that
      //   another data event will be required before
      //   we can make any future decisions.
      ++awaitingSSEsCount;

      // Tell the SSE that we are ready for more data.
      data.unpauseSSE();

      // We could potentially get more matches for the curShstRef.
      //   Therefore, we must wait to make any further decisions.
    };

    const handleNewDataForSubsequentShstRef = data => {
      // This data event was for a shstRef other than the curShstRef

      // We should be receiving the shstRefIds in sorted order from each SSE.
      const { shstRefId } = data;

      assert(
        curShstRefId === null || curShstRefId.localeCompare(shstRefId) < 0
      );

      // This data was not for the curShstRef, so we add it to the queue
      //   to become part of a future aggregation.
      addDataToQueue(data);

      // All SSEs are currently paused. Every SSE has sent data for a
      //   shstRef other than the curShstRef. Thus, no further aggregation
      //   possible for the curShstRef.
      if (awaitingSSEsCount === 0) {
        // We know that we will not see any more data for the curShstRef
        //   so we are ready to emit the aggregation
        emitAggregated();

        // After emitting the aggregated data for the curShstRef,
        //   we move onto the next shstRef in the queue.
        updateShStRefId();

        // Since the curShstRef has been updated to the next shstRef in
        //   in the queue, we KNOW that at least one queue member can be
        //   moved from the queue to the aggregation object.
        moveCurShStRefQueuedDataToAggregated();

        // After data is moved from the queue to the aggregate,
        //   the SSEs that emitted that data are unpaused.
        //   We can therefore get more data for the new curShstRef
        //   so we must wait to hear from the SSEs before we can
        //   make any further decisions.
      }
    };

    const handleSingleSourceEmitterDone = () => {
      // A SSE has signaled that it has no more data.

      // If that completes this round of awaited events, we can
      //   know that we will not see any more data for the curShstRef,
      //   so we are ready to emit the aggregation
      if (awaitingSSEsCount === 0) {
        emitAggregated();

        // After emitting the aggregated data for the curShstRef,
        //   we move onto the next shstRef in the queue.
        updateShStRefId();

        // Since the curShstRef has been updated to the next shstRef in
        //   in the queue, we KNOW that at least one queue member can be
        //   moved from the queue to the aggregation object.
        moveCurShStRefQueuedDataToAggregated();

        // After data is moved from the queue to the aggregate,
        //   the SSEs that emitted that data are unpaused.
        //   We can therefore get more data for the new curShstRef
        //   so we must wait to hear from the SSEs before we can
        //   make any further decisions.
      }
    };

    const onSSEDataListener = data => {
      --awaitingSSEsCount;
      if (data.shstRefId === curShstRefId) {
        handleNewDataForCurShStRef(data);
      } else {
        handleNewDataForSubsequentShstRef(data);
      }
    };

    function onSSEDoneListener() {
      // NOTE: Within this funtion, this refers to the SingleSourceEmitter

      // We heard from a SSEs from which we were awaiting an event.
      --awaitingSSEsCount;

      // Remove the SSE from the set of active SSEs
      activeSingleSourceEmitters.delete(this);

      // We no longer listen for data events from the SSE.
      this.removeListener('data', onSSEDataListener);

      if (activeSingleSourceEmitters.size === 0) {
        // Every SSE has signaled that it is done.
        // There will be no future data events.

        // To get to this point we had to unpause all the SSEs that had any data.
        //   We know this because of the following INVARIANT:
        //      we unpause an SSE ONLY after its data is in the aggregated object.
        //   Every SSE with data in the queue is paused.
        //   A paused SSE emits no events until it is unpaused.
        //   If we receive the "done" event for an SSE,
        //     it has no data in the queue and it will not send any more data.
        //   Therefore, once all SSEs send their done event we know that the only
        //     data remaining to emit is the current aggregation object,
        //     and that aggregation is complete.
        assert(queue.length === 0);

        assert(awaitingSSEsCount === 0);

        emitAggregated();
        emitDone();
      } else {
        //
        handleSingleSourceEmitterDone();
      }
    }

    activeSingleSourceEmitters.forEach(sse => {
      sse.once('done', onSSEDoneListener);
      sse.on('data', onSSEDataListener);
    });
  }
}

module.exports = AggregatedShstReferenceMatchesAsyncIterator;
