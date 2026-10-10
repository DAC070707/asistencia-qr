// Obreros (construccion civil / mineria): tipo de trabajador, categoria,
// porcentajes de horas extra por tipo y jornadas acumulativas (ciclo N x M).
// Aditiva: las empresas existentes quedan con gestiona_obreros = false y sus
// trabajadores como 'empleado', con los mismos 25% / 35% de siempre.
exports.up = async function (knex) {
  await knex.schema.alterTable('empresas', (table) => {
    table.boolean('gestiona_obreros').notNullable().defaultTo(false);
    table.string('regimen_obreros', 30).notNullable().defaultTo('general');
    table.smallint('extra_tramo1_empleado').notNullable().defaultTo(25);
    table.smallint('extra_tramo2_empleado').notNullable().defaultTo(35);
    table.smallint('extra_tramo1_obrero').notNullable().defaultTo(25);
    table.smallint('extra_tramo2_obrero').notNullable().defaultTo(35);
  });
  await knex.raw(
    "ALTER TABLE empresas ADD CONSTRAINT chk_regimen_obreros CHECK (regimen_obreros IN ('general','construccion_civil','mineria'))"
  );

  await knex.schema.alterTable('workers', (table) => {
    table.string('tipo_trabajador', 20).notNullable().defaultTo('empleado');
    table.string('categoria', 20).nullable();
  });
  await knex.raw(
    "ALTER TABLE workers ADD CONSTRAINT chk_tipo_trabajador CHECK (tipo_trabajador IN ('empleado','obrero'))"
  );
  await knex.raw(
    "ALTER TABLE workers ADD CONSTRAINT chk_categoria CHECK (categoria IS NULL OR categoria IN ('operario','oficial','peon'))"
  );

  await knex.raw('ALTER TABLE horario_versiones DROP CONSTRAINT chk_version_tipo');
  await knex.raw(
    "ALTER TABLE horario_versiones ADD CONSTRAINT chk_version_tipo CHECK (tipo IN ('semanal','rotativo','ciclo'))"
  );

  // Jornada acumulativa N x M: dias_trabajo dias de trabajo y dias_descanso de
  // descanso, empezando en fecha_inicio. Si dias_turno_dia tiene valor, los
  // primeros dias_turno_dia dias de trabajo son de dia y el resto de noche.
  await knex.schema.createTable('horario_ciclos', (table) => {
    table.increments('id').primary();
    table
      .integer('version_id')
      .notNullable()
      .unique()
      .references('id')
      .inTable('horario_versiones')
      .onDelete('CASCADE');
    table.date('fecha_inicio').notNullable();
    table.smallint('dias_trabajo').notNullable();
    table.smallint('dias_descanso').notNullable();
    table.time('hora_entrada').notNullable();
    table.time('hora_salida').notNullable();
    table.smallint('refrigerio_min').notNullable().defaultTo(0);
    table.smallint('dias_turno_dia').nullable();
    table.time('noche_hora_entrada').nullable();
    table.time('noche_hora_salida').nullable();
  });
  await knex.raw(
    'ALTER TABLE horario_ciclos ADD CONSTRAINT chk_ciclo_dias CHECK (dias_trabajo BETWEEN 1 AND 60 AND dias_descanso BETWEEN 0 AND 60)'
  );
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('horario_ciclos');
  await knex('horario_versiones').where({ tipo: 'ciclo' }).del();
  await knex.raw('ALTER TABLE horario_versiones DROP CONSTRAINT chk_version_tipo');
  await knex.raw(
    "ALTER TABLE horario_versiones ADD CONSTRAINT chk_version_tipo CHECK (tipo IN ('semanal','rotativo'))"
  );
  await knex.raw('ALTER TABLE workers DROP CONSTRAINT IF EXISTS chk_categoria');
  await knex.raw('ALTER TABLE workers DROP CONSTRAINT IF EXISTS chk_tipo_trabajador');
  await knex.schema.alterTable('workers', (table) => {
    table.dropColumn('tipo_trabajador');
    table.dropColumn('categoria');
  });
  await knex.raw('ALTER TABLE empresas DROP CONSTRAINT IF EXISTS chk_regimen_obreros');
  await knex.schema.alterTable('empresas', (table) => {
    table.dropColumn('gestiona_obreros');
    table.dropColumn('regimen_obreros');
    table.dropColumn('extra_tramo1_empleado');
    table.dropColumn('extra_tramo2_empleado');
    table.dropColumn('extra_tramo1_obrero');
    table.dropColumn('extra_tramo2_obrero');
  });
};
