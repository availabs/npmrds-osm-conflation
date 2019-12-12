#!/usr/bin/env node

/* eslint no-restricted-syntax: 0 */

const dao = require('./');

dao.initializeConflationMapSegIdxLookupTableForTargetMap('npmrds_2017');
dao.initializeConflationMapSegIdxLookupTableForTargetMap('npmrds_2019');
dao.initializeConflationMapSegIdxLookupTableForTargetMap('ris_2019');
