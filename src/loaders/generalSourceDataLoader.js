#!/usr/bin/env node

const { createReadStream } = require('fs');
const { Gunzip } = require('zlib');
const { pipe, through } = require('mississippi');
const split = require('split2');

const BATCH_SIZE = 2048;

const loadFeatures = ({ levelDbService, year, filePath }) =>
  new Promise((resolve, reject) => {
    const features = [];

    pipe(
      createReadStream(filePath),
      Gunzip(),
      split(JSON.parse),
      through.obj(
        async function batchLoad(feature, $, cb) {
          features.push(feature);

          if (features.length === BATCH_SIZE) {
            await levelDbService.putFeatures({ year, features });
            features.length = 0;
          }

          return cb();
        },
        async function flush(cb) {
          if (features.length) {
            await levelDbService.putFeatures({ year, features });
          }
          return cb();
        }
      ),
      err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });

// Load the gzipped NDJSON files concurrently
const loadGzippedInputFiles = ({ levelDbService, gzippedInputFilesByYear }) =>
  Promise.all(
    Object.keys(gzippedInputFilesByYear).map(year =>
      loadFeatures({
        levelDbService,
        year,
        filePath: gzippedInputFilesByYear[year]
      })
    )
  );

module.exports = {
  loadGzippedInputFiles
};
