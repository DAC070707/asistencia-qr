exports.up = async function (knex) {
  await knex.schema.alterTable('workers', (table) => {
    table.boolean('dispositivo_vinculado').notNullable().defaultTo(false);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('workers', (table) => {
    table.dropColumn('dispositivo_vinculado');
  });
};
