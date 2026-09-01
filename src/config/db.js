const knex = require('knex');
const env = require('./env');

const db = knex({
  client: 'pg',
  connection: env.databaseUrl,
  pool: { min: 0, max: 10 }
});

module.exports = db;
