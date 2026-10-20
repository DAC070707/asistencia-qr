// Control de la cuenta de cada empresa (activa / pago pendiente / suspendida)
// y cambio de contrasena. Aditiva: las empresas quedan 'activa' (o
// 'suspendida' si hoy tienen activo = false).
exports.up = async function (knex) {
  await knex.schema.alterTable('empresas', (table) => {
    table.string('estado_cuenta', 20).notNullable().defaultTo('activa');
    table.timestamp('estado_cuenta_en', { useTz: true }).nullable();
  });
  await knex.raw(
    "ALTER TABLE empresas ADD CONSTRAINT chk_estado_cuenta CHECK (estado_cuenta IN ('activa','pago_pendiente','suspendida'))"
  );
  await knex('empresas').where({ activo: false }).update({ estado_cuenta: 'suspendida' });

  await knex.schema.alterTable('admins', (table) => {
    table.timestamp('password_cambiado_en', { useTz: true }).nullable();
    table.boolean('debe_cambiar_password').notNullable().defaultTo(false);
  });
  await knex.schema.alterTable('super_admins', (table) => {
    table.timestamp('password_cambiado_en', { useTz: true }).nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('super_admins', (table) => {
    table.dropColumn('password_cambiado_en');
  });
  await knex.schema.alterTable('admins', (table) => {
    table.dropColumn('password_cambiado_en');
    table.dropColumn('debe_cambiar_password');
  });
  await knex.raw('ALTER TABLE empresas DROP CONSTRAINT IF EXISTS chk_estado_cuenta');
  await knex.schema.alterTable('empresas', (table) => {
    table.dropColumn('estado_cuenta');
    table.dropColumn('estado_cuenta_en');
  });
};
