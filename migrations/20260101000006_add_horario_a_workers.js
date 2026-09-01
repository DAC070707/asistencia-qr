exports.up = function (knex) {
  return knex.schema.alterTable('workers', (table) => {
    table.time('hora_entrada_programada').nullable();
    table.time('hora_salida_programada').nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('workers', (table) => {
    table.dropColumn('hora_entrada_programada');
    table.dropColumn('hora_salida_programada');
  });
};
