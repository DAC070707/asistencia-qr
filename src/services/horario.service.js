const db = require('../config/db');
const { calcularHorasPendientes, clasificarEntrada, clasificarSalida } = require('../utils/overtime');

function soloFecha(valor) {
  return typeof valor === 'string' ? valor.slice(0, 10) : new Date(valor).toISOString().slice(0, 10);
}

// 0=lunes .. 6=domingo (JS Date.getUTCDay da 0=domingo..6=sabado, se convierte).
function diaSemanaDeFecha(fecha) {
  const jsDay = new Date(`${soloFecha(fecha)}T12:00:00Z`).getUTCDay();
  return (jsDay + 6) % 7;
}

function horarioDePlantilla(plantilla) {
  if (!plantilla) return null;
  if (plantilla.es_descanso) return { libre: true, horaEntrada: null, horaSalida: null };
  return {
    libre: false,
    horaEntrada: plantilla.hora_entrada,
    horaSalida: plantilla.hora_salida,
    cruzaMedianoche: plantilla.cruza_medianoche
  };
}

// Resuelve el horario esperado de UN trabajador para UNA fecha especifica.
// Devuelve null si no hay forma de determinarlo (sin tipo_horario asignado,
// o datos incompletos). El orden de prioridad es: excepcion puntual > tipo
// de horario del trabajador (semanal o rotativo).
async function resolverHorarioDelDia(workerId, fecha) {
  const fechaTxt = soloFecha(fecha);

  const excepcion = await db('horario_excepciones')
    .where({ worker_id: workerId, fecha: fechaTxt })
    .first();
  if (excepcion) {
    if (excepcion.libre) return { libre: true, horaEntrada: null, horaSalida: null };
    if (excepcion.plantilla_id) {
      const plantilla = await db('plantillas_turno').where({ id: excepcion.plantilla_id }).first();
      return horarioDePlantilla(plantilla);
    }
    return { libre: false, horaEntrada: excepcion.hora_entrada, horaSalida: excepcion.hora_salida };
  }

  const worker = await db('workers').where({ id: workerId }).first();
  if (!worker || !worker.tipo_horario) return null;

  if (worker.tipo_horario === 'semanal') {
    const dia = diaSemanaDeFecha(fechaTxt);
    const fila = await db('horarios_semanales')
      .where({ worker_id: workerId, dia_semana: dia })
      .first();
    if (!fila) return null;
    if (fila.libre) return { libre: true, horaEntrada: null, horaSalida: null };
    return { libre: false, horaEntrada: fila.hora_entrada, horaSalida: fila.hora_salida };
  }

  if (worker.tipo_horario === 'rotativo') {
    const rotacion = await db('rotaciones').where({ worker_id: workerId }).first();
    if (!rotacion) return null;
    const pasos = await db('rotacion_pasos')
      .where({ rotacion_id: rotacion.id })
      .orderBy('posicion', 'asc');
    if (pasos.length === 0) return null;

    const N = pasos.length;
    const ancla = new Date(rotacion.fecha_ancla);
    const objetivo = new Date(`${fechaTxt}T00:00:00Z`);
    const dias = Math.round((objetivo - ancla) / (1000 * 60 * 60 * 24));
    const posicion = ((dias % N) + N) % N;
    const paso = pasos.find((p) => p.posicion === posicion) || pasos[posicion];

    const plantilla = await db('plantillas_turno').where({ id: paso.plantilla_id }).first();
    return horarioDePlantilla(plantilla);
  }

  return null;
}

// ---- Horario semanal (Nivel 1) ----

async function obtenerHorarioDeWorker(workerId) {
  const worker = await db('workers').where({ id: workerId }).first();
  if (!worker) return null;

  if (worker.tipo_horario === 'semanal') {
    const dias = await db('horarios_semanales')
      .where({ worker_id: workerId })
      .orderBy('dia_semana', 'asc');
    return { tipoHorario: 'semanal', semanal: dias, rotacion: null };
  }

  if (worker.tipo_horario === 'rotativo') {
    const rotacion = await db('rotaciones').where({ worker_id: workerId }).first();
    const pasos = rotacion
      ? await db('rotacion_pasos')
          .join('plantillas_turno', 'plantillas_turno.id', 'rotacion_pasos.plantilla_id')
          .where({ rotacion_id: rotacion.id })
          .orderBy('posicion', 'asc')
          .select(
            'rotacion_pasos.posicion',
            'rotacion_pasos.plantilla_id',
            'plantillas_turno.nombre as plantilla_nombre'
          )
      : [];
    return {
      tipoHorario: 'rotativo',
      semanal: null,
      rotacion: rotacion ? { fechaAncla: rotacion.fecha_ancla, pasos } : null
    };
  }

  return { tipoHorario: null, semanal: null, rotacion: null };
}

// dias: array de 7 { diaSemana, libre, horaEntrada, horaSalida }
async function guardarHorarioSemanal(workerId, dias) {
  await db.transaction(async (trx) => {
    await trx('workers').where({ id: workerId }).update({ tipo_horario: 'semanal' });
    await trx('rotaciones').where({ worker_id: workerId }).del(); // cascada borra los pasos
    await trx('horarios_semanales').where({ worker_id: workerId }).del();
    await trx('horarios_semanales').insert(
      dias.map((d) => ({
        worker_id: workerId,
        dia_semana: d.diaSemana,
        libre: !!d.libre,
        hora_entrada: d.libre ? null : d.horaEntrada || null,
        hora_salida: d.libre ? null : d.horaSalida || null
      }))
    );
  });
}

// pasos: array ordenado de plantilla_id (la posicion es el indice en el array)
async function guardarRotacion(workerId, fechaAncla, pasos) {
  await db.transaction(async (trx) => {
    await trx('workers').where({ id: workerId }).update({ tipo_horario: 'rotativo' });
    await trx('horarios_semanales').where({ worker_id: workerId }).del();

    let rotacion = await trx('rotaciones').where({ worker_id: workerId }).first();
    if (rotacion) {
      await trx('rotaciones').where({ id: rotacion.id }).update({ fecha_ancla: fechaAncla });
    } else {
      [rotacion] = await trx('rotaciones')
        .insert({ worker_id: workerId, fecha_ancla: fechaAncla })
        .returning('*');
    }

    await trx('rotacion_pasos').where({ rotacion_id: rotacion.id }).del();
    await trx('rotacion_pasos').insert(
      pasos.map((plantillaId, i) => ({
        rotacion_id: rotacion.id,
        posicion: i,
        plantilla_id: plantillaId
      }))
    );
  });
}

async function quitarHorario(workerId) {
  await db.transaction(async (trx) => {
    await trx('workers').where({ id: workerId }).update({ tipo_horario: null });
    await trx('rotaciones').where({ worker_id: workerId }).del();
    await trx('horarios_semanales').where({ worker_id: workerId }).del();
  });
}

// ---- Plantillas de turno (por empresa) ----

async function listarPlantillas(empresaId) {
  return db('plantillas_turno').where({ empresa_id: empresaId }).orderBy('nombre', 'asc');
}

async function crearPlantilla(empresaId, { nombre, horaEntrada, horaSalida, cruzaMedianoche, esDescanso }) {
  const [creada] = await db('plantillas_turno')
    .insert({
      empresa_id: empresaId,
      nombre,
      hora_entrada: esDescanso ? null : horaEntrada,
      hora_salida: esDescanso ? null : horaSalida,
      cruza_medianoche: !!cruzaMedianoche,
      es_descanso: !!esDescanso
    })
    .returning('*');
  return creada;
}

async function actualizarPlantilla(id, empresaId, cambios) {
  const datos = {};
  if (cambios.nombre !== undefined) datos.nombre = cambios.nombre;
  if (cambios.esDescanso !== undefined) datos.es_descanso = !!cambios.esDescanso;
  if (cambios.cruzaMedianoche !== undefined) datos.cruza_medianoche = !!cambios.cruzaMedianoche;
  if (cambios.horaEntrada !== undefined) datos.hora_entrada = cambios.horaEntrada || null;
  if (cambios.horaSalida !== undefined) datos.hora_salida = cambios.horaSalida || null;
  if (datos.es_descanso) {
    datos.hora_entrada = null;
    datos.hora_salida = null;
  }

  const [actualizada] = await db('plantillas_turno')
    .where({ id, empresa_id: empresaId })
    .update(datos)
    .returning('*');
  return actualizada || null;
}

async function eliminarPlantilla(id, empresaId) {
  return db('plantillas_turno').where({ id, empresa_id: empresaId }).del();
}

// ---- Excepciones puntuales ----

async function listarExcepciones(workerId) {
  return db('horario_excepciones')
    .leftJoin('plantillas_turno', 'plantillas_turno.id', 'horario_excepciones.plantilla_id')
    .where('horario_excepciones.worker_id', workerId)
    .orderBy('horario_excepciones.fecha', 'desc')
    .select(
      'horario_excepciones.id',
      'horario_excepciones.fecha',
      'horario_excepciones.libre',
      'horario_excepciones.hora_entrada',
      'horario_excepciones.hora_salida',
      'horario_excepciones.motivo',
      'plantillas_turno.nombre as plantilla_nombre'
    );
}

async function crearExcepcion(workerId, { fecha, libre, plantillaId, horaEntrada, horaSalida, motivo }) {
  const datos = {
    worker_id: workerId,
    fecha,
    libre: !!libre,
    plantilla_id: libre ? null : plantillaId || null,
    hora_entrada: !libre && !plantillaId ? horaEntrada || null : null,
    hora_salida: !libre && !plantillaId ? horaSalida || null : null,
    motivo: motivo || null
  };

  const existente = await db('horario_excepciones').where({ worker_id: workerId, fecha }).first();
  if (existente) {
    const [actualizada] = await db('horario_excepciones')
      .where({ id: existente.id })
      .update(datos)
      .returning('*');
    return actualizada;
  }
  const [creada] = await db('horario_excepciones').insert(datos).returning('*');
  return creada;
}

async function eliminarExcepcion(id, workerId) {
  return db('horario_excepciones').where({ id, worker_id: workerId }).del();
}

// Decora cada registro de asistencia con horas_pendientes y la clasificacion
// de la entrada/salida, resolviendo el horario del dia que corresponda a
// cada fila (worker_id, fecha) — cada uno puede caer en un dia distinto de
// la semana, una rotacion, o una excepcion puntual, asi que se resuelve por
// fila y no de forma global.
async function obtenerToleranciaEmpresa(empresaId) {
  const empresa = await db('empresas').where({ id: empresaId }).first();
  return empresa ? empresa.tolerancia_entrada_minutos : 5;
}

// toleranciaMinutos: tolerancia de ENTRADA de la empresa (resolver una sola
// vez por request con obtenerToleranciaEmpresa, no por fila).
async function decorarConHorario(registros, toleranciaMinutos) {
  if (typeof toleranciaMinutos !== 'number') {
    throw new Error('decorarConHorario requiere toleranciaMinutos');
  }
  return Promise.all(
    registros.map(async (r) => {
      const horario = await resolverHorarioDelDia(r.worker_id, r.fecha);
      const entrada = clasificarEntrada({ horaReal: r.creado_en, horario, toleranciaMinutos });
      const salida = r.hora_salida
        ? clasificarSalida({ horaReal: r.hora_salida, horario })
        : { estado: null, minutos: null };
      return {
        ...r,
        horas_pendientes: calcularHorasPendientes({
          fecha: r.fecha,
          horaSalida: r.hora_salida,
          horaSalidaProgramada: horario && !horario.libre ? horario.horaSalida : null
        }),
        entrada_estado: entrada.estado,
        entrada_minutos: entrada.minutos,
        salida_estado: salida.estado,
        salida_minutos: salida.minutos
      };
    })
  );
}

module.exports = {
  diaSemanaDeFecha,
  resolverHorarioDelDia,
  decorarConHorario,
  obtenerToleranciaEmpresa,
  obtenerHorarioDeWorker,
  guardarHorarioSemanal,
  guardarRotacion,
  quitarHorario,
  listarPlantillas,
  crearPlantilla,
  actualizarPlantilla,
  eliminarPlantilla,
  listarExcepciones,
  crearExcepcion,
  eliminarExcepcion
};
