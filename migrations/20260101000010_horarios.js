exports.up = async function (knex) {
  await knex.schema.createTable('horarios_semanales', (table) => {
    table.increments('id').primary();
    table.integer('worker_id').notNullable().references('id').inTable('workers').onDelete('CASCADE');
    table.smallint('dia_semana').notNullable(); // 0=lunes .. 6=domingo
    table.time('hora_entrada').nullable();
    table.time('hora_salida').nullable();
    table.boolean('libre').notNullable().defaultTo(false);
    table.unique(['worker_id', 'dia_semana']);
  });
  await knex.raw(
    'ALTER TABLE horarios_semanales ADD CONSTRAINT chk_dia_semana CHECK (dia_semana BETWEEN 0 AND 6)'
  );

  await knex.schema.createTable('plantillas_turno', (table) => {
    table.increments('id').primary();
    table.integer('empresa_id').notNullable().references('id').inTable('empresas');
    table.string('nombre', 60).notNullable();
    table.time('hora_entrada').nullable();
    table.time('hora_salida').nullable();
    table.boolean('cruza_medianoche').notNullable().defaultTo(false);
    table.boolean('es_descanso').notNullable().defaultTo(false);
    table.unique(['empresa_id', 'nombre']);
  });

  await knex.schema.createTable('rotaciones', (table) => {
    table.increments('id').primary();
    table
      .integer('worker_id')
      .notNullable()
      .unique()
      .references('id')
      .inTable('workers')
      .onDelete('CASCADE');
    table.date('fecha_ancla').notNullable();
  });

  await knex.schema.createTable('rotacion_pasos', (table) => {
    table.increments('id').primary();
    table
      .integer('rotacion_id')
      .notNullable()
      .references('id')
      .inTable('rotaciones')
      .onDelete('CASCADE');
    table.smallint('posicion').notNullable();
    table.integer('plantilla_id').notNullable().references('id').inTable('plantillas_turno');
    table.unique(['rotacion_id', 'posicion']);
  });

  await knex.schema.createTable('horario_excepciones', (table) => {
    table.increments('id').primary();
    table.integer('worker_id').notNullable().references('id').inTable('workers').onDelete('CASCADE');
    table.date('fecha').notNullable();
    table.integer('plantilla_id').nullable().references('id').inTable('plantillas_turno');
    table.time('hora_entrada').nullable();
    table.time('hora_salida').nullable();
    table.boolean('libre').notNullable().defaultTo(false);
    table.string('motivo', 160).nullable();
    table.unique(['worker_id', 'fecha']);
  });

  // Tipo de horario del trabajador: 'semanal' | 'rotativo' | NULL (sin configurar)
  await knex.schema.alterTable('workers', (table) => {
    table.string('tipo_horario', 20).nullable();
  });
  await knex.raw(
    "ALTER TABLE workers ADD CONSTRAINT chk_tipo_horario CHECK (tipo_horario IN ('semanal','rotativo'))"
  );

  // Backfill: los trabajadores que ya tenian horario fijo (hora_entrada_programada/
  // hora_salida_programada) pasan a 'semanal' con las 7 filas iguales, preservando
  // su comportamiento actual (mismo horario todos los dias).
  const conHorario = await knex('workers')
    .whereNotNull('hora_entrada_programada')
    .whereNotNull('hora_salida_programada')
    .select('id', 'hora_entrada_programada', 'hora_salida_programada');

  for (const w of conHorario) {
    await knex('workers').where({ id: w.id }).update({ tipo_horario: 'semanal' });
    const filas = [];
    for (let dia = 0; dia <= 6; dia++) {
      filas.push({
        worker_id: w.id,
        dia_semana: dia,
        hora_entrada: w.hora_entrada_programada,
        hora_salida: w.hora_salida_programada,
        libre: false
      });
    }
    await knex('horarios_semanales').insert(filas);
  }

  await knex.schema.alterTable('workers', (table) => {
    table.dropColumn('hora_entrada_programada');
    table.dropColumn('hora_salida_programada');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('workers', (table) => {
    table.time('hora_entrada_programada').nullable();
    table.time('hora_salida_programada').nullable();
  });

  const semanales = await knex('horarios_semanales').where({ dia_semana: 0 });
  for (const s of semanales) {
    await knex('workers')
      .where({ id: s.worker_id })
      .update({ hora_entrada_programada: s.hora_entrada, hora_salida_programada: s.hora_salida });
  }

  await knex.raw('ALTER TABLE workers DROP CONSTRAINT IF EXISTS chk_tipo_horario');
  await knex.schema.alterTable('workers', (table) => {
    table.dropColumn('tipo_horario');
  });

  await knex.schema.dropTableIfExists('horario_excepciones');
  await knex.schema.dropTableIfExists('rotacion_pasos');
  await knex.schema.dropTableIfExists('rotaciones');
  await knex.schema.dropTableIfExists('plantillas_turno');
  await knex.schema.dropTableIfExists('horarios_semanales');
};
