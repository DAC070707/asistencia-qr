// Usuarios adicionales por empresa con permisos. Los admins actuales quedan
// como 'principal' (todos los permisos); cada empresa puede tener hasta
// limite_usuarios_adicionales usuarios 'adicional' (1 por defecto).
exports.up = async function (knex) {
  await knex.schema.alterTable('admins', (table) => {
    table.string('rol', 20).notNullable().defaultTo('principal');
    table.string('nombre', 120).nullable();
    table.jsonb('permisos').notNullable().defaultTo('[]');
    table.integer('sucursal_id').nullable().references('id').inTable('sucursales').onDelete('SET NULL');
    table.boolean('activo').notNullable().defaultTo(true);
    table.integer('creado_por').nullable().references('id').inTable('admins').onDelete('SET NULL');
    table.timestamp('eliminado_en', { useTz: true }).nullable();
  });
  await knex.raw("ALTER TABLE admins ADD CONSTRAINT chk_admin_rol CHECK (rol IN ('principal','adicional'))");

  await knex.schema.alterTable('empresas', (table) => {
    table.smallint('limite_usuarios_adicionales').notNullable().defaultTo(1);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('empresas', (table) => {
    table.dropColumn('limite_usuarios_adicionales');
  });
  await knex.raw('ALTER TABLE admins DROP CONSTRAINT IF EXISTS chk_admin_rol');
  await knex.schema.alterTable('admins', (table) => {
    table.dropColumn('rol');
    table.dropColumn('nombre');
    table.dropColumn('permisos');
    table.dropColumn('sucursal_id');
    table.dropColumn('activo');
    table.dropColumn('creado_por');
    table.dropColumn('eliminado_en');
  });
};
