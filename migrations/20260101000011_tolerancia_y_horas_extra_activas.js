exports.up = async function (knex) {
  await knex.schema.alterTable('empresas', (table) => {
    table.integer('tolerancia_entrada_minutos').notNullable().defaultTo(5);
  });
  await knex.schema.alterTable('workers', (table) => {
    table.boolean('horas_extra_activas').notNullable().defaultTo(true);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('workers', (table) => {
    table.dropColumn('horas_extra_activas');
  });
  await knex.schema.alterTable('empresas', (table) => {
    table.dropColumn('tolerancia_entrada_minutos');
  });
};
