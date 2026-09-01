exports.up = function (knex) {
  return knex.schema.alterTable('attendance', (table) => {
    table.timestamp('hora_salida', { useTz: true }).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('attendance', (table) => {
    table.dropColumn('hora_salida');
  });
};
