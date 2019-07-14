const { join } = require('path');
const { Pool } = require('pg');
const envFile = require('node-env-file');

const envFilePath = join(__dirname, '../../.env')
envFile(envFilePath)

const pool = new Pool();
const query = (...params) => pool.query(...params);
const end = () => pool.end();

module.exports = {
  pool,
  query,
  end,
};
