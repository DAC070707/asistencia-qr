exports.up = async function (knex) {
  await knex.schema.createTable('sucursales', (table) => {
    table.increments('id').primary();
    table.integer('empresa_id').notNullable().references('id').inTable('empresas');
    table.text('nombre').notNullable();
    table.text('direccion');
    table.decimal('lat', 10, 7);
    table.decimal('lng', 10, 7);
    table.integer('radio_metros').notNullable().defaultTo(50);
    table.boolean('geolocalizacion_activa').notNullable().defaultTo(false);
    table.boolean('activo').notNullable().defaultTo(true);
    table.timestamp('creado_en', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Nullable a proposito: mientras se despliega el codigo nuevo, el codigo
  // anterior puede seguir insertando filas sin sucursal_id.
  for (const tabla of ['daily_codes', 'workers', 'attendance']) {
    await knex.schema.alterTable(tabla, (table) => {
      table.integer('sucursal_id').references('id').inTable('sucursales');
    });
  }

  // Cada empresa existente recibe una sucursal "Principal" que hereda su
  // ubicacion actual. Sus codigos QR y trabajadores se enlazan a ella (eran
  // negocios de un solo local). attendance NO se toca: los registros viejos
  // quedan con sucursal_id NULL.
  const empresas = await knex('empresas').select('*');
  for (const e of empresas) {
    const [principal] = await knex('sucursales')
      .insert({
        empresa_id: e.id,
        nombre: 'Principal',
        direccion: e.direccion,
        lat: e.lat,
        lng: e.lng,
        radio_metros: e.radio_metros,
        geolocalizacion_activa: e.geolocalizacion_activa
      })
      .returning('*');
    await knex('daily_codes').where({ empresa_id: e.id }).update({ sucursal_id: principal.id });
    await knex('workers').where({ empresa_id: e.id }).update({ sucursal_id: principal.id });
  }

  // Un codigo activo por sucursal (antes: por empresa).
  await knex.raw('DROP INDEX IF EXISTS uq_daily_codes_empresa_activo');
  await knex.raw(
    'CREATE UNIQUE INDEX uq_daily_codes_sucursal_activo ON daily_codes(sucursal_id) WHERE activo = true AND sucursal_id IS NOT NULL'
  );
};

exports.down = async function (knex) {
  await knex.raw('DROP INDEX IF EXISTS uq_daily_codes_sucursal_activo');
  await knex.raw(
    'CREATE UNIQUE INDEX uq_daily_codes_empresa_activo ON daily_codes(empresa_id) WHERE activo = true'
  );
  for (const tabla of ['attendance', 'workers', 'daily_codes']) {
    await knex.schema.alterTable(tabla, (table) => {
      table.dropColumn('sucursal_id');
    });
  }
  await knex.schema.dropTableIfExists('sucursales');
};
