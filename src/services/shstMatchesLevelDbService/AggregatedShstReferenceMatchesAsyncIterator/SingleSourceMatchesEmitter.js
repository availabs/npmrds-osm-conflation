const EventEmitter = require('events');

const { pipe, through } = require('mississippi');

const { getShStRefIdFeatureId } = require('../utils');

class SingleSourceMatchesEmitter extends EventEmitter {
  constructor({ targetMap, stream }) {
    super();

    const receivedDataFn = ({ key, value: matchFeature }, $, cb) => {
      const shstRefId = getShStRefIdFeatureId(key);

      const unpauseSSE = () => {
        cb();
      };

      this.emit('data', {
        targetMap,
        shstRefId,
        matchFeature,
        unpauseSSE
      });
    };

    const doneFn = cb => {
      this.emit('done');
      cb();
    };

    // Start the data flowing once we have a data event listener
    const awaitDataListenter = event => {
      if (event === 'data') {
        // We only want this code to execute once.
        this.removeListener('newListener', awaitDataListenter);
        pipe(
          stream,
          through.obj(receivedDataFn, doneFn)
        );
      }
    };

    this.on('newListener', awaitDataListenter);
  }
}

module.exports = SingleSourceMatchesEmitter;
