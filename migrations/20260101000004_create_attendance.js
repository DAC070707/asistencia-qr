exports.up = function (knex) {
  return knex.schema.createTable('attendance', (table) => {
    table.increments('id').primary();
    table.integer('worker_id').notNullable().references('id').inTable('workers');
    table.integer('daily_code_id').notNullable().references('id').inTable('daily_codes');
    table.date('fecha').notNullable();
    table.timestamp('creado_en', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['worker_id', 'fecha']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('attendance');
};
