#!/usr/bin/env node

const { isAbsolute, basename, join } = require('path');
const yargs = require('yargs');
const recursive = require('recursive-readdir');

const loadFeaturesFromGZippedNDSJON = require('./loadFeaturesFromGZippedNDSJON');

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

const getFeatureId = ({ properties: { gis_id, beg_mp } }) =>
  `${gis_id}##${beg_mp}`;

const dataDirAbs = isAbsolute(data_dir)
  ? data_dir
  : join(process.cwd(), data_dir);

const ignoreAllFilesExceptYearNDJSON = (file, stats) => {
  return stats.isFile() && !basename(file).match(/^ris\.\d{4}\.ndjson\.gz$/);
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

      const targetMap = `ris_${year}`;

      // eslint-disable-next-line no-await-in-loop
      await loadFeaturesFromGZippedNDSJON({
        targetMap,
        filePath,
        getFeatureId
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
