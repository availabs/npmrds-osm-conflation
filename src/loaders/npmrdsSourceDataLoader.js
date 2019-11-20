#!/usr/bin/env node

const { isAbsolute, basename, join } = require('path');
const yargs = require('yargs');
const recursive = require('recursive-readdir');

const { loadGzippedInputFiles } = require('./generalSourceDataLoader');

const levelDbService = require('../services/npmrdsLevelDbService');

const cliArgsSpec = {
  data_dir: {
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

const { data_dir } = argv;

const dataDirAbs = isAbsolute(data_dir)
  ? data_dir
  : join(process.cwd(), data_dir);

const ignoreAllFilesExceptYearNDJSON = (file, stats) => {
  return stats.isFile() && !basename(file).match(/^npmrds\.\d{4}\.ndjson\.gz$/);
};

(async () => {
  try {
    const ndjsonGzFiles = await recursive(dataDirAbs, [
      ignoreAllFilesExceptYearNDJSON
    ]);

    const gzippedInputFilesByYear = ndjsonGzFiles.reduce((acc, filePath) => {
      const fileBaseName = basename(filePath);
      const [year] = fileBaseName.match(/\d{4}/);

      acc[year] = filePath;
      return acc;
    }, {});

    // Load the NDJSON files concurrently
    await loadGzippedInputFiles({
      levelDbService,
      gzippedInputFilesByYear
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(
        `ERROR: The provided data_dir, ${data_dir}, does not exist.`
      );
      process.exit(1);
    } else {
      throw err;
    }
  }
})();
