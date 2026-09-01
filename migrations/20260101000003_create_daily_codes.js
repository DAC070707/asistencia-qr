exports.up = async function (knex) {
  await knex.schema.createTable('daily_codes', (table) => {
    table.increments('id').primary();
    table.date('fecha').notNullable();
    table.string('token', 64).notNullable().unique();
    table.boolean('activo').notNullable().defaultTo(true);
    table.integer('creado_por').references('id').inTable('admins').onDelete('SET NULL');
    table.timestamp('creado_en', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Solo puede existir un codigo activo por fecha, permitiendo regenerar sin perder el historico
  await knex.raw(
    'CREATE UNIQUE INDEX uq_daily_codes_fecha_activo ON daily_codes(fecha) WHERE activo = true'
  );
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('daily_codes');
};
