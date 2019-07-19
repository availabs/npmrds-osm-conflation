/* eslint no-cond-assign: 0, no-continue: 0 */

const { bbox } = require('@turf/turf');
const RBush = require('rbush');
const { get } = require('lodash');

const IndexedNDJSONFile = require('./IndexedNDJSONFile');

function createSpatialIndex() {
  this.spatialIndex = new RBush();

  this.keys().forEach(id => {
    const feature = this.get(id);
    const [minX, minY, maxX, maxY] = bbox(feature);

    this.spatialIndex.insert({ id, minX, minY, maxX, maxY });
  });
}

function createNetworkIndex(networkFilePath) {
  if (networkFilePath) {
    this.networkIndex = new IndexedNDJSONFile({
      filePath: networkFilePath,
      key: 'id'
    });
  } else {
    // Since all network indexing methods depend on this.networkIndex.get(id),
    //   the following ensures all will throw if called, while the class API
    //   remains consistent and error messages meaningful.
    this.networkIndex = {
      get() {
        throw new Error(
          'No networkFilePath passed to the EnhancedIndexedNDJSONFile constructor.'
        );
      }
    };
  }

  // Add getters to this EnhancedndexedNDJSONFile instance
  this.getInEdgeIds = id => {
    const record = this.networkIndex.get(id);

    if (!record) {
      console.error(`networkIndex miss for ${id}`);
      return null;
    }

    const { inEdges = [] } = record;
    return inEdges;
  };

  this.getInEdges = id => {
    const inEdgeIds = this.getInEdgeIds(id);
    return inEdgeIds && this.getInEdgeIds(id).map(i => this.get(i));
  };

  this.getOutEdgeIds = id => {
    const record = this.networkIndex.get(id);

    if (!record) {
      console.error(`networkIndex miss for ${id}`);
      return null;
    }

    const { outEdges = [] } = record;
    return outEdges;
  };

  this.getOutEdges = id => {
    const outEdgeIds = this.getOutEdgeIds(id);
    return outEdgeIds && this.getOutEdgeIds(id).map(i => this.get(i));
  };

  this.getNeighborIds = id => {
    const inEdgeIds = this.getInEdgeIds(id);
    const outEdgeIds = this.getOutEdgeIds(id);

    return inEdgeIds || outEdgeIds
      ? {
          inEdgeIds,
          outEdgeIds
        }
      : null;
  };

  this.getNeighbors = id => {
    const inEdges = this.getInEdges(id);
    const outEdges = this.getOutEdges(id);

    return inEdges || outEdges
      ? {
          inEdges,
          outEdges
        }
      : null;
  };
}

class EnhancedIndexedNDJSONFile extends IndexedNDJSONFile {
  constructor(params) {
    super(params);
    const { networkFilePath } = params;

    createNetworkIndex.call(this, networkFilePath);
  }

  getByBoundingBoxCoords([minX, minY, maxX, maxY]) {
    if (!this.spatialIndex) {
      createSpatialIndex.call(this);
    }

    const ids = this.spatialIndex
      .search({ minX, minY, maxX, maxY })
      .map(({ id: i }) => i);

    return ids && ids.length ? ids : null;
  }

  getInBoundingBox(feature) {
    if (!this.spatialIndex) {
      createSpatialIndex.call(this);
    }

    const id = get(feature, this.key);

    const [minX, minY, maxX, maxY] = bbox(feature);

    const ids = this.spatialIndex
      .search({ id, minX, minY, maxX, maxY })
      .map(({ id: i }) => i);

    return ids && ids.length ? ids : null;
  }

  append(d) {
    super.append(d);
    const id = get(d, this.key);

    this.spatialIndex.remove({ id }, (a, b) => {
      return a.id === b.id;
    });

    const [minX, minY, maxX, maxY] = bbox(d);
    this.spatialIndex.insert({ id, minX, minY, maxX, maxY });
  }

  close() {
    super.close();
    this.networkIndex.close();
  }
}

module.exports = EnhancedIndexedNDJSONFile;
