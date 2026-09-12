exports.up = async function (knex) {
  await knex.schema.alterTable('empresas', (table) => {
    table.text('direccion');
    table.decimal('lat', 10, 7);
    table.decimal('lng', 10, 7);
    table.integer('radio_metros').notNullable().defaultTo(50);
    table.boolean('geolocalizacion_activa').notNullable().defaultTo(false);
  });

  await knex.schema.alterTable('attendance', (table) => {
    table.decimal('entrada_lat', 10, 7);
    table.decimal('entrada_lng', 10, 7);
    table.decimal('entrada_distancia_m', 8, 2);
    table.decimal('salida_lat', 10, 7);
    table.decimal('salida_lng', 10, 7);
    table.decimal('salida_distancia_m', 8, 2);
  });

  // El cron diario (ya eliminado) solo desactivaba el codigo de la fecha que
  // estaba creando, nunca el del dia anterior — asi que pueden existir varias
  // filas "activo=true" de fechas distintas para una misma empresa. Nunca fue
  // un problema porque validarToken ademas exigia fecha=hoy. Al quitar ese
  // filtro, hay que dejar activa solo la mas reciente de cada empresa antes de
  // poder crear el indice unico por empresa (sin fecha). Esto NO toca la
  // tabla attendance en absoluto.
  await knex.raw(`
    UPDATE daily_codes
    SET activo = false
    WHERE activo = true
      AND id NOT IN (
        SELECT DISTINCT ON (empresa_id) id
        FROM daily_codes
        WHERE activo = true
        ORDER BY empresa_id, fecha DESC, id DESC
      )
  `);

  await knex.raw('DROP INDEX IF EXISTS uq_daily_codes_empresa_fecha_activo');
  await knex.raw(
    'CREATE UNIQUE INDEX uq_daily_codes_empresa_activo ON daily_codes(empresa_id) WHERE activo = true'
  );
};

exports.down = async function (knex) {
  await knex.raw('DROP INDEX IF EXISTS uq_daily_codes_empresa_activo');
  await knex.raw(
    'CREATE UNIQUE INDEX uq_daily_codes_empresa_fecha_activo ON daily_codes(empresa_id, fecha) WHERE activo = true'
  );

  await knex.schema.alterTable('attendance', (table) => {
    table.dropColumn('entrada_lat');
    table.dropColumn('entrada_lng');
    table.dropColumn('entrada_distancia_m');
    table.dropColumn('salida_lat');
    table.dropColumn('salida_lng');
    table.dropColumn('salida_distancia_m');
  });

  await knex.schema.alterTable('empresas', (table) => {
    table.dropColumn('direccion');
    table.dropColumn('lat');
    table.dropColumn('lng');
    table.dropColumn('radio_metros');
    table.dropColumn('geolocalizacion_activa');
  });
};
