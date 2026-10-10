// Pase de un solo uso para llevar la llave del trabajador desde el navegador
// interno de otra app (Google, lector de QR) a su navegador normal.
exports.up = async function (knex) {
  await knex.schema.alterTable('escaneos_qr', (table) => {
    table.timestamp('transferido_en', { useTz: true }).nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('escaneos_qr', (table) => {
    table.dropColumn('transferido_en');
  });
};
