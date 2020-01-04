#!/usr/bin/env node

const _ = require('lodash');

const isSomething = v => !(_.isNil(v) || v === '');

module.exports = {
  isSomething
};
