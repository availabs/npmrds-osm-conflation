#!/usr/bin/env node

const { createReadStream } = require('fs');
const { Gunzip } = require('zlib');
const { pipe, through } = require('mississippi');
const split = require('split2');
const targetMapsSQLiteService = require('../services/targetMapsSQLiteService');

const loadFeaturesFromGZippedNDJSON = ({
  targetMap,
  filePath,
  getFeatureId,
  featureFilter = () => true
}) =>
  new Promise((resolve, reject) => {
    pipe(
      createReadStream(filePath),
      Gunzip(),
      split(JSON.parse),
      through.obj(async function loader(feature, $, cb) {
        // eslint-disable-next-line no-param-reassign
        feature.id = getFeatureId(feature);

        if (featureFilter(feature)) {
          targetMapsSQLiteService.insertFeatures(targetMap, feature);
        }

        return cb();
      }),
      err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });

module.exports = loadFeaturesFromGZippedNDJSON;
