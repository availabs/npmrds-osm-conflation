#!/usr/bin/env node

const { createReadStream } = require('fs');
const { isAbsolute, basename, join } = require('path');
const { Gunzip } = require('zlib');
const yargs = require('yargs');
const recursive = require('recursive-readdir');
const { pipe, through } = require('mississippi');
const split = require('split2');

const npmrdsLevelDbService = require('../services/npmrdsLevelDbService');

const BATCH_SIZE = 2048;

const cliArgsSpec = {
  npmrds_data_dir: {
    demand: true,
    type: 'string'
  }
};

const { argv } = yargs
  .strict()
  .parserConfiguration({
    'camel-case-expansion': false,
    'flatten-duplicate-arrays': false
  })
  .wrap(yargs.terminalWidth() / 1.618)
  .option(cliArgsSpec);

const { npmrds_data_dir } = argv;

const npmrdsDataDirAbs = isAbsolute(npmrds_data_dir)
  ? npmrds_data_dir
  : join(process.cwd(), npmrds_data_dir);

const ignoreAllFilesExceptYearNDJSON = (file, stats) => {
  return stats.isFile() && !basename(file).match(/^npmrds\.\d{4}\.ndjson\.gz$/);
};

const loadFeatures = filePath =>
  new Promise((resolve, reject) => {
    const fileBaseName = basename(filePath);
    const [year] = fileBaseName.match(/\d{4}/);

    const features = [];

    pipe(
      createReadStream(filePath),
      Gunzip(),
      split(JSON.parse),
      through.obj(
        async function batchLoad(feature, $, cb) {
          features.push(feature);

          if (features.length === BATCH_SIZE) {
            await npmrdsLevelDbService.putFeatures({ year, features });
            features.length = 0;
          }

          return cb();
        },
        async function flush(cb) {
          if (features.length) {
            await npmrdsLevelDbService.putFeatures({ year, features });
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

(async () => {
  let ndjsonGzFiles;
  try {
    ndjsonGzFiles = await recursive(npmrdsDataDirAbs, [
      ignoreAllFilesExceptYearNDJSON
    ]);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(
        `ERROR: The provided npmrds_data_dir, ${npmrds_data_dir}, does not exist.`
      );
      process.exit(1);
    } else {
      throw err;
    }
  }

  ndjsonGzFiles.sort();

  // Remove the old NPMRDS LevelDb database
  await npmrdsLevelDbService.destroy();

  // Load the NDJSON files concurrently
  await Promise.all(ndjsonGzFiles.map(loadFeatures));
})();
