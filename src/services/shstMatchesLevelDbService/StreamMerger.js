/* eslint no-underscore-dangle: 0 */
const { pipe, through } = require('mississippi');
const turfHelpers = require('@turf/helpers');
const _ = require('lodash');

const { getShStRefIdFeatureId } = require('./utils');

const getStreamId = (dataSource, year) => `${dataSource}::${year}`;

class FlowRegulator {
  constructor() {
    let _releaseInputSynchronizer;
    let _releaseOutputSynchronizer;

    const _resetInputSynchronizer = () => {
      const _prevReleaseInputSynchronizer = _releaseInputSynchronizer;

      this.inputSynchronizer = new Promise(resolve => {
        _releaseInputSynchronizer = resolve;
      });

      if (_prevReleaseInputSynchronizer) {
        _prevReleaseInputSynchronizer();
      }
    };

    const _resetOutputSynchronizer = value => {
      const _prevReleaseOutputSynchronizer = _releaseOutputSynchronizer;

      this.outputSynchronizer = new Promise(resolve => {
        _releaseOutputSynchronizer = resolve;
      });

      if (!_.isUndefined(value)) {
        _prevReleaseOutputSynchronizer(value);
      }
    };

    // Initialize the mutexes
    _resetInputSynchronizer();
    _resetOutputSynchronizer();

    this.releaseInputSynchronizer = _resetInputSynchronizer;
    this.releaseOutputSynchronizer = _resetOutputSynchronizer;
  }
}

function emitCollection() {
  const featureCollectionByDataSourceYear = Object.keys(this.collector).reduce(
    (acc, dataSource) => {
      const years = Object.keys(this.collector[dataSource]);

      for (let i = 0; i < years.length; ++i) {
        const year = years[i];
        const features = this.collector[dataSource][year];
        const featureCollection = turfHelpers.featureCollection(features);

        acc[dataSource] = acc[dataSource] || {};
        acc[dataSource][year] = featureCollection;
      }

      return acc;
    },
    {}
  );

  // Clear the collector
  this.collector = {};

  // Update the curShstRefId to the minimum queued shstRefId
  this.curShstRefId = getShStRefIdFeatureId(_.first(this.queue).key);

  // emit the data collection
  this.flowRegulator.releaseOutputSynchronizer(
    featureCollectionByDataSourceYear
  );
}

async function moveFeaturesFromQueueToCollection() {
  const pendingCallbacks = [];

  // Move queued entries with the curShstRefId to the collector.
  while (this.queue.length) {
    const [{ shstRefId, dataSource, year, value, cb }] = this.queue;

    if (shstRefId === this.curShstRefId) {
      const streamId = getStreamId(dataSource, year);

      // Add this entry to the collector
      this.collector[dataSource] = this.collector[dataSource] || {};
      this.collector[dataSource][year] = this.collector[dataSource][year] || [];
      this.collector[dataSource][year].push(value);

      // Remove this entry from the queue
      this.queue.shift();

      this.awaitingStreams.add(streamId);

      // FIXME: These should queue until the consumer stream requests more data.

      // Add this entry's stream cb to the list of callbacks called
      //   when after the consumer of this generator takes the next chunk of data.
      pendingCallbacks.push(cb);
    } else {
      break;
    }
  }

  // Wait until the yield loop signals it is ready for more data.
  for (let i = 0; i < pendingCallbacks.length; ++i) {
    setImmediate(pendingCallbacks[i]);
  }
}

async function manage() {
  this.queue.sort(({ key: a }, { key: b }) => a.localeCompare(b));

  // curShstRefId is the minimum shstRefId in the queue
  //   If it is falsy, this is the first call to manage.
  this.curShstRefId =
    this.curShstRefId || getShStRefIdFeatureId(_.first(this.queue).key);

  // If the curShstRefId is no longer in the queue,
  //   we have seen all entries for that shstRef
  const allEntriesForShStRefSeen = this.queue.every(
    ({ shstRefId }) => shstRefId !== this.curShstRefId
  );
  const collectorContainsData = !_.isEmpty(this.collector);

  if (allEntriesForShStRefSeen && collectorContainsData) {
    this.emitCollection();
    await this.flowRegulator.inputSynchronizer;
  }

  await this.moveFeaturesFromQueueToCollection();
}

async function report(dataSource, year, kvPair, $, cb) {
  const streamId = getStreamId(dataSource, year);
  this.awaitingStreams.delete(streamId);

  // A null kvPair indicates the current stream ended.
  if (kvPair === null) {
    // Remove the current stream from the activeStreams set
    this.activeStreams.delete(streamId);

    // call the flush method on the stream to close it.
    setImmediate(cb);
  } else {
    const { key, value } = kvPair;

    // If we got data for a stream, it is either because
    //   a) the stream is reporting for the first time
    //   b) or we added the stream's previous entry to the collector
    //      then called the stream's cb, asking for more data.
    this.queue.push({
      shstRefId: getShStRefIdFeatureId(key),
      dataSource,
      year,
      key,
      value,
      cb
    });
  }

  // If we are not awaiting any streams, we have enough information proceed.
  if (this.awaitingStreams.size === 0) {
    if (this.activeStreams.size) {
      await this.manage();
    } else {
      while (this.queue.length) {
        // eslint-disable-next-line no-await-in-loop
        await this.manage();
      }
    }
  }

  this.done = this.awaitingStreams.size === 0 && this.queue.length === 0;
}

function initializeInputFlowControl(readStreamsByDataSourceYear) {
  const dataSources = Object.keys(readStreamsByDataSourceYear);
  for (let i = 0; i < dataSources.length; ++i) {
    const dataSource = dataSources[i];

    const years = Object.keys(readStreamsByDataSourceYear[dataSource]);
    for (let j = 0; j < years.length; ++j) {
      const year = years[j];

      const streamId = getStreamId(dataSource, year);

      this.activeStreams.add(streamId);
      this.awaitingStreams.add(streamId);

      pipe(
        readStreamsByDataSourceYear[dataSource][year],
        // NOTE: The callback function passed to the through's
        //       transformFunction controls the flow of from the
        //       source stream. By handing those callbacks over
        //       to a central controller, we get proper synchronization
        //       while merging the streams.
        through.obj(
          // The transformFunction sends the kvPair and the cb to report
          _.curry(this.report)(dataSource, year),
          // The flushFunction sends a null kvPair and the cb to report
          _.curry(this.report)(dataSource, year, null, null)
        )
      );
    }
  }
}

class StreamMerger {
  constructor(readStreamsByDataSourceYear) {
    const that = {
      queue: [],
      activeStreams: new Set(),
      awaitingStreams: new Set(),

      curShstRefId: null,
      collector: {},
      done: false,
      flowRegulator: new FlowRegulator()
    };

    that.moveFeaturesFromQueueToCollection = moveFeaturesFromQueueToCollection.bind(
      that
    );
    that.emitCollection = emitCollection.bind(that);
    that.manage = manage.bind(that);
    that.report = report.bind(that);

    initializeInputFlowControl.call(that, readStreamsByDataSourceYear);

    this[Symbol.asyncIterator] = async function* asyncIteratorFn() {
      while (!that.done) {
        // eslint-disable-next-line no-await-in-loop
        const d = await that.flowRegulator.outputSynchronizer;
        yield d;
        that.flowRegulator.releaseInputSynchronizer();
      }
    };
  }
}

module.exports = StreamMerger;
