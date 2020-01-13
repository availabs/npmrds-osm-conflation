#!/usr/bin/env node

const { createReadStream } = require('fs');
const { Gunzip } = require('zlib');
const { pipe, through } = require('mississippi');
const split = require('split2');
const _ = require('lodash');

const loadFeaturesFromGZippedNDJSON = ({
  dbService,
  filePath,
  getTargetMapProperties,
  propertyTransforms = f => f
}) =>
  new Promise((resolve, reject) => {
    pipe(
      createReadStream(filePath),
      Gunzip(),
      split(JSON.parse),
      through.obj(async function loader(feature, $, cb) {
        try {
          if (
            _.isNil(feature.geometry) ||
            !Array.isArray(feature.geometry.coordinates) ||
            feature.geometry.coordinates.length < 2
          ) {
            return cb();
          }

          Object.assign(
            feature.properties,
            getTargetMapProperties(feature),
            propertyTransforms(feature)
          );

          // // FIXME: Remove dev subset filter
          // if (feature.properties.targetMapCountyCode !== '36001') {
          //   return cb();
          // }

          // eslint-disable-next-line no-param-reassign
          feature.id = feature.properties.targetMapId;

          dbService.insertTargetMapFeature(feature);
        } catch (err) {
          console.error(err.message);
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
