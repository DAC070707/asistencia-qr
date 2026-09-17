exports.up = async function (knex) {
  await knex.schema.alterTable('workers', (table) => {
    table.date('fecha_ingreso');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('workers', (table) => {
    table.dropColumn('fecha_ingreso');
  });
};
