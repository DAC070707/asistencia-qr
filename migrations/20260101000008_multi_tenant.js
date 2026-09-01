exports.up = async function (knex) {
  await knex.schema.createTable('empresas', (table) => {
    table.increments('id').primary();
    table.string('nombre', 160).notNullable();
    table.boolean('activo').notNullable().defaultTo(true);
    table.timestamp('creado_en', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Tabla separada (no una fila mas en "admins") para que la sesion de
  // super-admin nunca se pueda confundir con la de un admin de empresa.
  await knex.schema.createTable('super_admins', (table) => {
    table.increments('id').primary();
    table.string('email', 160).notNullable().unique();
    table.string('password_hash', 200).notNullable();
    table.timestamp('creado_en', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  const [empresaDemo] = await knex('empresas').insert({ nombre: 'Cliente demo' }).returning('*');

  // empresa_id nullable primero: se llena con los datos existentes antes de
  // exigir NOT NULL, para no perder nada de lo ya cargado.
  for (const tabla of ['admins', 'workers', 'daily_codes', 'attendance']) {
    await knex.schema.alterTable(tabla, (table) => {
      table.integer('empresa_id').references('id').inTable('empresas');
    });
    await knex(tabla).update({ empresa_id: empresaDemo.id });
    await knex.raw(`ALTER TABLE ${tabla} ALTER COLUMN empresa_id SET NOT NULL`);
  }

  // workers.dni pasa de unico global a unico por empresa.
  const { rows: constraints } = await knex.raw(`
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'workers'::regclass AND contype = 'u'
  `);
  for (const { conname } of constraints) {
    await knex.raw(`ALTER TABLE workers DROP CONSTRAINT "${conname}"`);
  }
  await knex.raw(
    'ALTER TABLE workers ADD CONSTRAINT uq_workers_empresa_dni UNIQUE (empresa_id, dni)'
  );

  // daily_codes: un solo codigo activo por dia, ahora por empresa (antes era
  // un solo codigo activo por dia de forma global).
  await knex.raw('DROP INDEX IF EXISTS uq_daily_codes_fecha_activo');
  await knex.raw(
    'CREATE UNIQUE INDEX uq_daily_codes_empresa_fecha_activo ON daily_codes(empresa_id, fecha) WHERE activo = true'
  );
};

exports.down = async function (knex) {
  await knex.raw('DROP INDEX IF EXISTS uq_daily_codes_empresa_fecha_activo');
  await knex.raw(
    'CREATE UNIQUE INDEX uq_daily_codes_fecha_activo ON daily_codes(fecha) WHERE activo = true'
  );

  await knex.raw('ALTER TABLE workers DROP CONSTRAINT IF EXISTS uq_workers_empresa_dni');
  await knex.raw('ALTER TABLE workers ADD CONSTRAINT workers_dni_unique UNIQUE (dni)');

  for (const tabla of ['admins', 'workers', 'daily_codes', 'attendance']) {
    await knex.schema.alterTable(tabla, (table) => {
      table.dropColumn('empresa_id');
    });
  }

  await knex.schema.dropTableIfExists('super_admins');
  await knex.schema.dropTableIfExists('empresas');
};
