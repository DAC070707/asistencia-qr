exports.up = function (knex) {
  return knex.schema.createTable('admins', (table) => {
    table.increments('id').primary();
    table.string('email', 160).notNullable().unique();
    table.string('password_hash', 200).notNullable();
    table.timestamp('creado_en', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('admins');
};
