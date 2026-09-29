const db = require('../config/db');
const { calcularHorasPendientes, calcularHorasExtra, clasificarEntrada, clasificarSalida } = require('../utils/overtime');
const { hoyLima } = require('../utils/limaDate');

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

// Version de horario vigente de un trabajador en una fecha: la de mayor
// vigente_desde que sea <= fecha. null si todavia no tenia horario.
async function versionVigente(workerId, fechaTxt) {
  return db('horario_versiones')
    .where({ worker_id: workerId })
    .andWhere('vigente_desde', '<=', fechaTxt)
    .orderBy('vigente_desde', 'desc')
    .first();
}

// Resuelve el horario esperado de UN trabajador para UNA fecha especifica.
// Devuelve null si no hay forma de determinarlo (sin horario vigente a esa
// fecha, o datos incompletos). El orden de prioridad es: excepcion puntual >
// version de horario vigente a esa fecha (semanal o rotativo).
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

  const version = await versionVigente(workerId, fechaTxt);
  if (!version) return null;

  if (version.tipo === 'semanal') {
    const dia = diaSemanaDeFecha(fechaTxt);
    const fila = await db('horarios_semanales')
      .where({ version_id: version.id, dia_semana: dia })
      .first();
    if (!fila) return null;
    if (fila.libre) return { libre: true, horaEntrada: null, horaSalida: null };
    return { libre: false, horaEntrada: fila.hora_entrada, horaSalida: fila.hora_salida };
  }

  if (version.tipo === 'rotativo') {
    const rotacion = await db('rotaciones').where({ version_id: version.id }).first();
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

// ---- Versiones de horario (horario con fecha de vigencia) ----

// Todas las versiones de un trabajador, la mas reciente primero, con su
// contenido y su estado respecto de hoy: 'vigente' | 'programado' | 'anterior'.
async function listarVersiones(workerId) {
  const hoy = hoyLima();
  const versiones = await db('horario_versiones')
    .where({ worker_id: workerId })
    .orderBy('vigente_desde', 'desc');

  const vigente = versiones.find((v) => soloFecha(v.vigente_desde) <= hoy);
  const resultado = [];
  for (const v of versiones) {
    const desde = soloFecha(v.vigente_desde);
    const item = {
      id: v.id,
      vigenteDesde: desde,
      tipo: v.tipo,
      estado: desde > hoy ? 'programado' : v === vigente ? 'vigente' : 'anterior',
      semanal: null,
      rotacion: null
    };
    if (v.tipo === 'semanal') {
      item.semanal = await db('horarios_semanales')
        .where({ version_id: v.id })
        .orderBy('dia_semana', 'asc')
        .select('dia_semana', 'libre', 'hora_entrada', 'hora_salida');
    } else {
      const rotacion = await db('rotaciones').where({ version_id: v.id }).first();
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
      item.rotacion = rotacion ? { fechaAncla: soloFecha(rotacion.fecha_ancla), pasos } : null;
    }
    resultado.push(item);
  }
  return resultado;
}

async function obtenerVersion(workerId, versionId) {
  return db('horario_versiones').where({ id: versionId, worker_id: workerId }).first();
}

// Reemplaza el contenido (dias semanales o rotacion) de una version.
async function escribirContenidoVersion(trx, version, { tipo, semanal, rotacion }) {
  await trx('horarios_semanales').where({ version_id: version.id }).del();
  await trx('rotaciones').where({ version_id: version.id }).del(); // cascada borra los pasos

  if (tipo === 'semanal') {
    await trx('horarios_semanales').insert(
      semanal.map((d) => ({
        worker_id: version.worker_id,
        version_id: version.id,
        dia_semana: d.diaSemana,
        libre: !!d.libre,
        hora_entrada: d.libre ? null : d.horaEntrada || null,
        hora_salida: d.libre ? null : d.horaSalida || null
      }))
    );
    return;
  }

  const [nueva] = await trx('rotaciones')
    .insert({ worker_id: version.worker_id, version_id: version.id, fecha_ancla: rotacion.fechaAncla })
    .returning('*');
  await trx('rotacion_pasos').insert(
    rotacion.pasos.map((plantillaId, i) => ({
      rotacion_id: nueva.id,
      posicion: i,
      plantilla_id: plantillaId
    }))
  );
}

// workers.tipo_horario ya no decide nada; se mantiene como el tipo del
// horario vigente hoy por compatibilidad.
async function sincronizarTipoVigente(trx, workerId) {
  const vigente = await trx('horario_versiones')
    .where({ worker_id: workerId })
    .andWhere('vigente_desde', '<=', hoyLima())
    .orderBy('vigente_desde', 'desc')
    .first();
  await trx('workers').where({ id: workerId }).update({ tipo_horario: vigente ? vigente.tipo : null });
}

// Crea una version vigente desde "vigenteDesde". Si ya existe una version con
// esa misma fecha, se reemplaza su contenido. Devuelve la version.
async function crearVersion(workerId, { vigenteDesde, tipo, semanal, rotacion }) {
  return db.transaction(async (trx) => {
    let version = await trx('horario_versiones')
      .where({ worker_id: workerId, vigente_desde: vigenteDesde })
      .first();
    if (version) {
      [version] = await trx('horario_versiones').where({ id: version.id }).update({ tipo }).returning('*');
    } else {
      [version] = await trx('horario_versiones')
        .insert({ worker_id: workerId, vigente_desde: vigenteDesde, tipo })
        .returning('*');
    }
    await escribirContenidoVersion(trx, version, { tipo, semanal, rotacion });
    await sincronizarTipoVigente(trx, workerId);
    return version;
  });
}

// Edita contenido y/o fecha de una version. Devuelve { version, desdeAnterior }
// o { conflicto: true } si ya hay otra version con la nueva fecha.
async function actualizarVersion(workerId, versionId, { vigenteDesde, tipo, semanal, rotacion }) {
  return db.transaction(async (trx) => {
    const actual = await trx('horario_versiones').where({ id: versionId, worker_id: workerId }).first();
    if (!actual) return null;
    const desdeAnterior = soloFecha(actual.vigente_desde);

    if (vigenteDesde !== desdeAnterior) {
      const otra = await trx('horario_versiones')
        .where({ worker_id: workerId, vigente_desde: vigenteDesde })
        .whereNot({ id: versionId })
        .first();
      if (otra) return { conflicto: true };
    }

    const [version] = await trx('horario_versiones')
      .where({ id: versionId })
      .update({ vigente_desde: vigenteDesde, tipo })
      .returning('*');
    await escribirContenidoVersion(trx, version, { tipo, semanal, rotacion });
    await sincronizarTipoVigente(trx, workerId);
    return { version, desdeAnterior };
  });
}

// Elimina una version; devuelve la fecha desde la que regia, o null.
async function eliminarVersion(workerId, versionId) {
  return db.transaction(async (trx) => {
    const [borrada] = await trx('horario_versiones')
      .where({ id: versionId, worker_id: workerId })
      .del()
      .returning('*');
    if (!borrada) return null;
    await sincronizarTipoVigente(trx, workerId);
    return soloFecha(borrada.vigente_desde);
  });
}

// ---- Recalculo de horas extra ----

// Recalcula horas_extra_25/35 de las marcaciones con salida del trabajador
// (opcionalmente solo entre desde/hasta), contra el horario vigente en cada
// fecha. Respeta horas_extra_activas (desactivadas => 0). No toca el estado
// de aprobacion. Devuelve cuantas filas cambiaron.
async function recalcularHorasExtra(workerId, { desde, hasta } = {}) {
  const worker = await db('workers').where({ id: workerId }).first('horas_extra_activas');
  if (!worker) return 0;

  const query = db('attendance').where({ worker_id: workerId }).whereNotNull('hora_salida');
  if (desde) query.andWhere('fecha', '>=', desde);
  if (hasta) query.andWhere('fecha', '<=', hasta);
  const registros = await query.select('id', 'fecha', 'hora_salida', 'horas_extra_25', 'horas_extra_35');

  let cambios = 0;
  for (const r of registros) {
    let extra25 = 0;
    let extra35 = 0;
    if (worker.horas_extra_activas) {
      const horario = await resolverHorarioDelDia(workerId, r.fecha);
      ({ extra25, extra35 } = calcularHorasExtra({
        horaSalida: r.hora_salida,
        horaSalidaProgramada: horario && !horario.libre ? horario.horaSalida : null
      }));
    }
    const distinto =
      Math.abs((Number(r.horas_extra_25) || 0) - extra25) > 0.005 ||
      Math.abs((Number(r.horas_extra_35) || 0) - extra35) > 0.005;
    if (distinto) {
      await db('attendance').where({ id: r.id }).update({ horas_extra_25: extra25, horas_extra_35: extra35 });
      cambios++;
    }
  }
  return cambios;
}

// Trabajadores cuyo horario depende de una plantilla de turno (por rotacion
// o por excepcion puntual).
async function trabajadoresQueUsanPlantilla(plantillaId) {
  const porRotacion = await db('rotacion_pasos')
    .join('rotaciones', 'rotaciones.id', 'rotacion_pasos.rotacion_id')
    .where('rotacion_pasos.plantilla_id', plantillaId)
    .distinct('rotaciones.worker_id');
  const porExcepcion = await db('horario_excepciones').where({ plantilla_id: plantillaId }).distinct('worker_id');
  return [...new Set([...porRotacion, ...porExcepcion].map((f) => f.worker_id))];
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

// Devuelve la excepcion borrada (para recalcular ese dia), o null.
async function eliminarExcepcion(id, workerId) {
  const [borrada] = await db('horario_excepciones').where({ id, worker_id: workerId }).del().returning('*');
  return borrada || null;
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

// Config de geolocalizacion de la SUCURSAL del QR escaneado, usada por
// checkin.controller para decidir si exige y valida lat/lng al marcar.
async function obtenerConfigUbicacion(sucursalId) {
  const sucursal = sucursalId ? await db('sucursales').where({ id: sucursalId }).first() : null;
  return {
    activa: sucursal?.geolocalizacion_activa || false,
    lat: sucursal?.lat != null ? Number(sucursal.lat) : null,
    lng: sucursal?.lng != null ? Number(sucursal.lng) : null,
    radioMetros: sucursal?.radio_metros ?? 50,
    nombre: sucursal?.nombre || null
  };
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

// Arma, dia por dia y trabajador por trabajador, la grilla completa de
// asistencia de un rango de fechas: cada fila es una marcacion real, o una
// inasistencia (le tocaba trabajar segun su horario y no hay registro), o
// simplemente no existe (dia de descanso sin marcar, no es inasistencia).
// Un dia sin horario vigente no genera fila de inasistencia
// (no hay forma de saber si le tocaba) pero sus marcaciones reales si
// aparecen igual. Tampoco se generan inasistencias antes de su fecha_ingreso
// (o, si no la configuraron, antes de que el trabajador se creara en el
// sistema) — evita marcar como "no vino" un dia en que todavia no era
// trabajador de la empresa.
async function construirGrillaAsistencia({ empresaId, desde, hasta, workerId, sucursalId }) {
  const workersQuery = db('workers').where({ empresa_id: empresaId, activo: true });
  if (workerId) workersQuery.andWhere({ id: workerId });
  if (sucursalId) workersQuery.andWhere({ sucursal_id: sucursalId });
  const workers = await workersQuery.orderBy('nombre', 'asc');

  const toleranciaMinutos = await obtenerToleranciaEmpresa(empresaId);

  const attendanceQuery = db('attendance')
    .where({ empresa_id: empresaId })
    .andWhere('fecha', '>=', desde)
    .andWhere('fecha', '<=', hasta);
  if (workerId) attendanceQuery.andWhere({ worker_id: workerId });
  if (sucursalId) attendanceQuery.whereIn('worker_id', workers.map((w) => w.id));
  const registrosReales = await attendanceQuery;

  const porWorkerFecha = new Map();
  for (const r of registrosReales) {
    porWorkerFecha.set(`${r.worker_id}|${soloFecha(r.fecha)}`, r);
  }

  const fechas = [];
  for (
    let cursor = new Date(`${soloFecha(desde)}T00:00:00Z`), fin = new Date(`${soloFecha(hasta)}T00:00:00Z`);
    cursor <= fin;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    fechas.push(cursor.toISOString().slice(0, 10));
  }

  // Solo pueden tener inasistencias quienes tienen algun horario o excepcion;
  // el resto se salta sin consultar dia por dia.
  const ids = workers.map((w) => w.id);
  const conHorario = new Set([
    ...(await db('horario_versiones').whereIn('worker_id', ids).distinct('worker_id')).map((f) => f.worker_id),
    ...(await db('horario_excepciones').whereIn('worker_id', ids).distinct('worker_id')).map((f) => f.worker_id)
  ]);

  const filas = [];
  for (const worker of workers) {
    const pisoFecha = worker.fecha_ingreso ? soloFecha(worker.fecha_ingreso) : soloFecha(worker.creado_en);

    for (const fecha of fechas) {
      const registro = porWorkerFecha.get(`${worker.id}|${fecha}`);

      if (registro) {
        const horario = await resolverHorarioDelDia(worker.id, fecha);
        const entrada = clasificarEntrada({ horaReal: registro.creado_en, horario, toleranciaMinutos });
        filas.push({
          worker,
          fecha,
          horaEntrada: registro.creado_en,
          horaSalida: registro.hora_salida,
          refrigerioSalida: registro.refrigerio_salida_en,
          refrigerioRegreso: registro.refrigerio_regreso_en,
          tardanzaMinutos: entrada.estado === 'tarde' ? entrada.minutos : null,
          horasExtra25: Number(registro.horas_extra_25) || 0,
          horasExtra35: Number(registro.horas_extra_35) || 0,
          inasistencia: false
        });
        continue;
      }

      if (!conHorario.has(worker.id)) continue;
      if (fecha < pisoFecha) continue;

      const horario = await resolverHorarioDelDia(worker.id, fecha);
      if (horario && !horario.libre) {
        filas.push({
          worker,
          fecha,
          horaEntrada: null,
          horaSalida: null,
          tardanzaMinutos: null,
          horasExtra25: 0,
          horasExtra35: 0,
          inasistencia: true
        });
      }
    }
  }

  return filas;
}

module.exports = {
  diaSemanaDeFecha,
  resolverHorarioDelDia,
  decorarConHorario,
  construirGrillaAsistencia,
  obtenerToleranciaEmpresa,
  obtenerConfigUbicacion,
  listarVersiones,
  obtenerVersion,
  crearVersion,
  actualizarVersion,
  eliminarVersion,
  recalcularHorasExtra,
  trabajadoresQueUsanPlantilla,
  listarPlantillas,
  crearPlantilla,
  actualizarPlantilla,
  eliminarPlantilla,
  listarExcepciones,
  crearExcepcion,
  eliminarExcepcion
};
