exports.up = function (knex) {
  return knex.schema.createTable('workers', (table) => {
    table.increments('id').primary();
    table.string('dni', 15).notNullable().unique();
    table.string('nombre', 120).notNullable();
    table.boolean('activo').notNullable().defaultTo(true);
    table.timestamp('creado_en', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('workers');
};
