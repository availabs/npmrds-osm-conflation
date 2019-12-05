#!/usr/bin/env node

const { isAbsolute, basename, join } = require('path');
const yargs = require('yargs');
const recursive = require('recursive-readdir');

const loadFeaturesFromGZippedNDSJON = require('./loadFeaturesFromGZippedNDSJON');

const cliArgsSpec = {
  data_dir: {
    demand: true,
    type: 'string'
  },
  county: {
    demand: false,
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

const { data_dir, county } = argv;

const COUNTY = county ? county.toUpperCase() : null;

const getFeatureId = ({ properties: { tmc } }) => tmc;

const featureFilter = COUNTY
  ? ({ properties: { county: c } }) =>
      c && c.replace(/[^A-Z ]/i, '').toUpperCase() === COUNTY
  : () => true;

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

    ndjsonGzFiles.sort();

    for (let i = 0; i < ndjsonGzFiles.length; ++i) {
      const filePath = ndjsonGzFiles[i];

      const fileBaseName = basename(filePath);
      const [year] = fileBaseName.match(/\d{4}/);

      const targetMap = `npmrds_${year}`;

      // eslint-disable-next-line no-await-in-loop
      await loadFeaturesFromGZippedNDSJON({
        targetMap,
        filePath,
        getFeatureId,
        featureFilter
      });
    }
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
