const { closeSync, readFileSync, writeSync } = require('fs');
const { range, head, tail, sortBy } = require('lodash');
const { fileSync } = require('tmp');

const IndexedNDJSONFile = require('./IndexedNDJSONFile');

const testData = [
  { outer: { id: 'foo', data: range(0, 4) } },
  { outer: { id: 'bar', data: range(16, 32) } },
  { outer: { id: 'baz', data: range(64, 128) } }
];

const testDataKeys = testData.map(({ outer: { id } }) => id).sort();

describe('IndexedNDJSONFile Tests', () => {
  test('Simple Correctness Test', () => {
    // Create a temp file
    const { name, fd } = fileSync();

    const hd = head(testData);

    const row = Buffer.from(`${JSON.stringify(hd)}\n`);
    writeSync(fd, row);
    closeSync(fd);

    const indexedFile = new IndexedNDJSONFile({
      filePath: name,
      key: 'outer.id'
    });

    expect(indexedFile.keys()).toEqual([hd.outer.id]);

    expect(indexedFile.get(hd.outer.id)).toEqual(hd);

    const rest = tail(testData);

    for (let i = 0; i < rest.length; ++i) {
      const d = rest[i];
      indexedFile.append(d);
    }

    expect(indexedFile.keys().sort()).toEqual(testDataKeys);

    for (let i = 0; i < testData.length; ++i) {
      const d = testData[i];
      const {
        outer: { id }
      } = d;

      expect(indexedFile.get(id)).toEqual(d);
    }

    indexedFile.close();

    const fileData = readFileSync(name, { encoding: 'utf8' })
      .split('\n')
      .filter(l => l)
      .map(line => JSON.parse(line));

    expect(sortBy(fileData, 'id')).toEqual(sortBy(testData, 'id'));
  });
});
