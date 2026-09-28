exports.up = async function (knex) {
  await knex.schema.alterTable('empresas', (table) => {
    table.boolean('controla_refrigerio').notNullable().defaultTo(false);
  });
  await knex.schema.alterTable('attendance', (table) => {
    table.timestamp('refrigerio_salida_en', { useTz: true });
    table.timestamp('refrigerio_regreso_en', { useTz: true });
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('attendance', (table) => {
    table.dropColumn('refrigerio_salida_en');
    table.dropColumn('refrigerio_regreso_en');
  });
  await knex.schema.alterTable('empresas', (table) => {
    table.dropColumn('controla_refrigerio');
  });
};
