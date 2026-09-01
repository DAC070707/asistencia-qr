exports.up = async function (knex) {
  await knex.schema.alterTable('attendance', (table) => {
    table.decimal('horas_extra_25', 4, 2).notNullable().defaultTo(0);
    table.decimal('horas_extra_35', 4, 2).notNullable().defaultTo(0);
    table.string('horas_extra_estado', 20).notNullable().defaultTo('pendiente');
    table.integer('horas_extra_aprobado_por').references('id').inTable('admins').onDelete('SET NULL');
    table.timestamp('horas_extra_aprobado_en', { useTz: true }).nullable();
    table.integer('editado_por').references('id').inTable('admins').onDelete('SET NULL');
    table.timestamp('editado_en', { useTz: true }).nullable();
  });

  await knex.raw(
    "ALTER TABLE attendance ADD CONSTRAINT chk_horas_extra_estado CHECK (horas_extra_estado IN ('pendiente','aprobado','rechazado'))"
  );
};

exports.down = async function (knex) {
  await knex.raw('ALTER TABLE attendance DROP CONSTRAINT IF EXISTS chk_horas_extra_estado');
  await knex.schema.alterTable('attendance', (table) => {
    table.dropColumn('horas_extra_25');
    table.dropColumn('horas_extra_35');
    table.dropColumn('horas_extra_estado');
    table.dropColumn('horas_extra_aprobado_por');
    table.dropColumn('horas_extra_aprobado_en');
    table.dropColumn('editado_por');
    table.dropColumn('editado_en');
  });
};
