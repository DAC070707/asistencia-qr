exports.up = async function (knex) {
  // Margen de error (metros) que reporto el celular al marcar.
  await knex.schema.alterTable('attendance', (table) => {
    table.decimal('entrada_precision_m', 8, 2);
    table.decimal('salida_precision_m', 8, 2);
  });

  // Intentos de marcacion rechazados por ubicacion, para diagnosticar quien
  // tiene problemas y por que. No afecta ninguna marcacion.
  await knex.schema.createTable('intentos_marcacion_rechazados', (table) => {
    table.increments('id').primary();
    table.integer('empresa_id').notNullable().references('id').inTable('empresas').onDelete('CASCADE');
    table.integer('sucursal_id').nullable().references('id').inTable('sucursales').onDelete('SET NULL');
    table.integer('worker_id').nullable().references('id').inTable('workers').onDelete('CASCADE');
    table.string('accion', 30).nullable();
    table.string('motivo', 30).notNullable();
    table.decimal('distancia_m', 10, 2).nullable();
    table.decimal('precision_m', 10, 2).nullable();
    table.string('dispositivo', 20).nullable();
    table.string('user_agent', 300).nullable();
    table.timestamp('creado_en', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['empresa_id', 'creado_en']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('intentos_marcacion_rechazados');
  await knex.schema.alterTable('attendance', (table) => {
    table.dropColumn('entrada_precision_m');
    table.dropColumn('salida_precision_m');
  });
};
