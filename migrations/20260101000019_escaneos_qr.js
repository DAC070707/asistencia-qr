// Cada apertura del enlace del QR crea un codigo de escaneo de un solo uso:
// despues de marcar, volver atras en el navegador no permite marcar de nuevo
// sin escanear otra vez.
exports.up = async function (knex) {
  await knex.schema.createTable('escaneos_qr', (table) => {
    table.increments('id').primary();
    table.string('codigo', 64).notNullable().unique();
    table.integer('daily_code_id').notNullable().references('id').inTable('daily_codes').onDelete('CASCADE');
    table.integer('empresa_id').notNullable().references('id').inTable('empresas').onDelete('CASCADE');
    table.integer('sucursal_id').nullable().references('id').inTable('sucursales').onDelete('SET NULL');
    table.integer('worker_id').nullable().references('id').inTable('workers').onDelete('CASCADE');
    table.timestamp('creado_en', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('usado_en', { useTz: true }).nullable();
    table.index(['creado_en']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('escaneos_qr');
};
