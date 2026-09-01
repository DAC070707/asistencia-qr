exports.up = function (knex) {
  return knex.schema.alterTable('empresas', (table) => {
    table.binary('logo_data').nullable();
    table.string('logo_mime', 60).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('empresas', (table) => {
    table.dropColumn('logo_data');
    table.dropColumn('logo_mime');
  });
};
