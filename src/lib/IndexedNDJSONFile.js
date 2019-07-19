const { openSync, readSync, writeSync, closeSync } = require('fs');
const LineByLine = require('n-readlines');
const { get } = require('lodash');

/* eslint no-cond-assign: 0, no-continue: 0 */

class IndexedNDJSONFile {
  constructor({ filePath, key }) {
    this.key = key;

    const lineReader = new LineByLine(filePath);
    let line;
    let position = 0;
    let maxLineLength = 0;

    // Using Map to preserve insert order, so that
    //   iterating over the keys entails a sequential file scan.
    this.fileIndex = new Map();

    while ((line = lineReader.next())) {
      const k = get(JSON.parse(line), this.key);

      if (k === undefined) {
        console.error(filePath, this.key, k);
        console.warn(
          'WARNING: Undefined indexing key value for IndexedNDJSONFile row'
        );
        continue;
      }

      if (this.fileIndex.has(k)) {
        console.warn(
          `WARNING: Indexing key value ${k} is not unique. Overwriting the previous entry.`
        );
      }

      const pos = position;
      const len = line.byteLength;

      position += len + 1;

      if (len > maxLineLength) {
        maxLineLength = len;
      }

      this.fileIndex.set(`${k}`, { pos, len });
    }

    this.endPosition = position;

    this.fd = openSync(filePath, 'a+');
    this.buffer = Buffer.alloc(maxLineLength + 1);
  }

  get(k) {
    const entry = this.fileIndex.get(`${k}`);

    if (!entry) {
      return null;
    }
    const { pos, len } = entry;

    const bytesRead = readSync(this.fd, this.buffer, 0, len, pos);

    const row = this.buffer.slice(0, bytesRead);
    const d = JSON.parse(row);

    return d;
  }

  keys() {
    return [...this.fileIndex.keys()];
  }

  forEachId(fn) {
    this.keys().forEach(fn);
  }

  forEach(fn) {
    this.forEachId(id => fn(this.get(id)));
  }

  // NOTE: If you append to the file a record whose id
  //       appeared earlier in the file, the record retrieval
  //       info is overwritten. This allows the IndexedNDJSONFile
  //       to be used for an append log.
  append(d) {
    const id = get(d, this.key);

    const line = Buffer.from(`${JSON.stringify(d)}\n`);

    const { byteLength } = line;

    if (byteLength > this.buffer.length) {
      this.buffer = Buffer.alloc(byteLength);
    }

    writeSync(this.fd, line, 0, byteLength, this.endPosition);

    this.fileIndex.set(`${id}`, { pos: this.endPosition, len: byteLength });

    this.endPosition += byteLength;
  }

  close() {
    closeSync(this.fd);
  }
}

module.exports = IndexedNDJSONFile;
