#!/usr/bin/env node

const levelup = require('levelup');
const leveldown = require('leveldown');
const encode = require('encoding-down');

const { dirSync: mkTmpDirSync } = require('tmp');

// Temporary LevelDB work database deleted on process exit.

async function add(k) {
  await this.db.put(k, null);
}

async function has(k) {
  try {
    await this.db.get(k);
    return true;
  } catch (err) {
    return false;
  }
}

async function del(k) {
  try {
    await this.db.del(k);
  } catch (err) {
    //
  }
}

class XSet {
  constructor() {
    const { name: tmpDirPath } = mkTmpDirSync({ unsafeCleanup: true });

    const db = levelup(encode(leveldown(tmpDirPath)));

    const that = { db };

    this.add = add.bind(that);
    this.has = has.bind(that);
    this.delete = del.bind(that);
  }
}

module.exports = XSet;
