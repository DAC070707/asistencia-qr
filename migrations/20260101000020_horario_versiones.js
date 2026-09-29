// Horarios con fecha de vigencia: cada trabajador puede tener varias
// versiones de horario, cada una vigente desde una fecha. El horario actual
// de cada trabajador pasa a ser su primera version, vigente desde el inicio
// (la fecha mas temprana entre su ingreso, su alta y su primera marcacion).
// No se borra ninguna fila; workers.tipo_horario se conserva.
exports.up = async function (knex) {
  await knex.schema.createTable('horario_versiones', (table) => {
    table.increments('id').primary();
    table.integer('worker_id').notNullable().references('id').inTable('workers').onDelete('CASCADE');
    table.date('vigente_desde').notNullable();
    table.string('tipo', 20).notNullable();
    table.timestamp('creado_en', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['worker_id', 'vigente_desde']);
  });
  await knex.raw(
    "ALTER TABLE horario_versiones ADD CONSTRAINT chk_version_tipo CHECK (tipo IN ('semanal','rotativo'))"
  );

  await knex.schema.alterTable('horarios_semanales', (table) => {
    table.integer('version_id').nullable().references('id').inTable('horario_versiones').onDelete('CASCADE');
  });
  await knex.schema.alterTable('rotaciones', (table) => {
    table.integer('version_id').nullable().references('id').inTable('horario_versiones').onDelete('CASCADE');
  });

  const workers = await knex('workers as w')
    .whereNotNull('w.tipo_horario')
    .select(
      'w.id',
      'w.tipo_horario',
      knex.raw(
        `least(
           w.fecha_ingreso,
           (w.creado_en at time zone 'America/Lima')::date,
           (select min(a.fecha) from attendance a where a.worker_id = w.id)
         ) as desde`
      )
    );

  for (const w of workers) {
    const [version] = await knex('horario_versiones')
      .insert({ worker_id: w.id, vigente_desde: w.desde, tipo: w.tipo_horario })
      .returning('*');
    if (w.tipo_horario === 'semanal') {
      await knex('horarios_semanales').where({ worker_id: w.id }).update({ version_id: version.id });
    } else {
      await knex('rotaciones').where({ worker_id: w.id }).update({ version_id: version.id });
    }
  }

  await knex.schema.alterTable('horarios_semanales', (table) => {
    table.dropUnique(['worker_id', 'dia_semana']);
    table.unique(['version_id', 'dia_semana']);
  });
  await knex.schema.alterTable('rotaciones', (table) => {
    table.dropUnique(['worker_id']);
    table.unique(['version_id']);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('rotaciones', (table) => {
    table.dropUnique(['version_id']);
    table.unique(['worker_id']);
    table.dropColumn('version_id');
  });
  await knex.schema.alterTable('horarios_semanales', (table) => {
    table.dropUnique(['version_id', 'dia_semana']);
    table.unique(['worker_id', 'dia_semana']);
    table.dropColumn('version_id');
  });
  await knex.schema.dropTableIfExists('horario_versiones');
};
