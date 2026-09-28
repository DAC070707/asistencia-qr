const db = require('../config/db');
const { hoyLima } = require('../utils/limaDate');
const { calcularHorasExtra } = require('../utils/overtime');
const { resolverHorarioDelDia } = require('./horario.service');

const COLUMNAS_ASISTENCIA = [
  'attendance.id',
  'attendance.worker_id',
  'workers.dni',
  'workers.nombre',
  'attendance.creado_en',
  'attendance.hora_salida',
  'attendance.fecha',
  'attendance.horas_extra_25',
  'attendance.horas_extra_35',
  'attendance.horas_extra_estado',
  'attendance.editado_en',
  'attendance.entrada_distancia_m',
  'attendance.refrigerio_salida_en',
  'attendance.refrigerio_regreso_en',
  'attendance.sucursal_id',
  'sucursales.nombre as sucursal_nombre'
];

async function buscarOCrearWorker({ dni, nombre, empresaId }) {
  const existente = await db('workers').where({ dni, empresa_id: empresaId }).first();
  if (existente) return existente;

  // Empresa con una sola sucursal: el trabajador nuevo queda en ella. Con 2 o
  // mas, queda sin sucursal hasta que el admin se la asigne.
  const sucursales = await db('sucursales').where({ empresa_id: empresaId, activo: true }).select('id');
  const sucursalId = sucursales.length === 1 ? sucursales[0].id : null;

  const [creado] = await db('workers')
    .insert({ dni, nombre, empresa_id: empresaId, sucursal_id: sucursalId })
    .returning('*');
  return creado;
}

// Intenta reclamar el DNI para el dispositivo que se esta identificando
// ahora. Condicional (WHERE dispositivo_vinculado = false) para que, si dos
// dispositivos intentan reclamarlo casi al mismo tiempo, solo uno gane la
// carrera. Devuelve true si este dispositivo gano/ya estaba vinculado a el
// mismo worker sin haberlo reclamado antes; false si otro dispositivo ya lo
// tenia vinculado.
async function vincularDispositivo(workerId) {
  const [actualizado] = await db('workers')
    .where({ id: workerId, dispositivo_vinculado: false })
    .update({ dispositivo_vinculado: true })
    .returning('*');
  return Boolean(actualizado);
}

async function buscarAsistenciaDeHoy(workerId) {
  const fecha = hoyLima();
  return db('attendance').where({ worker_id: workerId, fecha }).first();
}

async function marcarEntrada({ workerId, dailyCodeId, empresaId, sucursalId, geo }) {
  const fecha = hoyLima();

  // Ya marco entrada hoy: no duplicar, devolver el registro existente.
  const existente = await buscarAsistenciaDeHoy(workerId);
  if (existente) return { registro: existente, yaExistia: true };

  const [creado] = await db('attendance')
    .insert({
      worker_id: workerId,
      daily_code_id: dailyCodeId,
      empresa_id: empresaId,
      sucursal_id: sucursalId ?? null,
      fecha,
      entrada_lat: geo?.lat ?? null,
      entrada_lng: geo?.lng ?? null,
      entrada_distancia_m: geo?.distanciaMetros ?? null
    })
    .returning('*');
  return { registro: creado, yaExistia: false };
}

async function marcarSalida({ workerId, geo }) {
  const existente = await buscarAsistenciaDeHoy(workerId);
  if (!existente) {
    return { error: 'sin_entrada' };
  }
  if (existente.hora_salida) {
    return { registro: existente, yaExistia: true };
  }

  const horaSalida = new Date();
  const worker = await db('workers').where({ id: workerId }).first();
  const horario = await resolverHorarioDelDia(workerId, existente.fecha);
  const { extra25, extra35 } = worker.horas_extra_activas
    ? calcularHorasExtra({
        horaSalida,
        horaSalidaProgramada: horario && !horario.libre ? horario.horaSalida : null
      })
    : { extra25: 0, extra35: 0 };

  const [actualizado] = await db('attendance')
    .where({ id: existente.id })
    .update({
      hora_salida: horaSalida,
      horas_extra_25: extra25,
      horas_extra_35: extra35,
      salida_lat: geo?.lat ?? null,
      salida_lng: geo?.lng ?? null,
      salida_distancia_m: geo?.distanciaMetros ?? null
    })
    .returning('*');
  return { registro: actualizado, yaExistia: false };
}

// Refrigerio: salida y regreso, una vez por dia, solo entre la entrada y la
// salida del dia. Marcar lo mismo dos veces devuelve la hora ya registrada.
async function marcarRefrigerioSalida({ workerId }) {
  const existente = await buscarAsistenciaDeHoy(workerId);
  if (!existente) return { error: 'sin_entrada' };
  if (existente.refrigerio_salida_en) return { registro: existente, yaExistia: true };
  if (existente.hora_salida) return { error: 'jornada_cerrada' };

  const [actualizado] = await db('attendance')
    .where({ id: existente.id })
    .update({ refrigerio_salida_en: new Date() })
    .returning('*');
  return { registro: actualizado, yaExistia: false };
}

async function marcarRefrigerioRegreso({ workerId }) {
  const existente = await buscarAsistenciaDeHoy(workerId);
  if (!existente) return { error: 'sin_entrada' };
  if (existente.refrigerio_regreso_en) return { registro: existente, yaExistia: true };
  if (!existente.refrigerio_salida_en) return { error: 'sin_salida_refrigerio' };
  if (existente.hora_salida) return { error: 'jornada_cerrada' };

  const [actualizado] = await db('attendance')
    .where({ id: existente.id })
    .update({ refrigerio_regreso_en: new Date() })
    .returning('*');
  return { registro: actualizado, yaExistia: false };
}

// El admin corrige la hora de entrada y/o salida de un registro DE SU PROPIA
// EMPRESA. El filtro por empresa_id es lo que evita que un admin edite (o
// siquiera detecte la existencia de) un registro de otra empresa adivinando
// el id en la URL. Recalcula horas extra con el horario ACTUAL del
// trabajador y vuelve el estado a "pendiente" (una aprobacion previa
// quedaria basada en datos incorrectos).
async function editarRegistro(id, { horaEntrada, horaSalida }, adminId, empresaId) {
  const registro = await db('attendance').where({ id, empresa_id: empresaId }).first();
  if (!registro) return null;

  const nuevaEntrada = horaEntrada ? new Date(horaEntrada) : new Date(registro.creado_en);
  const nuevaSalida = horaSalida
    ? new Date(horaSalida)
    : registro.hora_salida
      ? new Date(registro.hora_salida)
      : null;

  const worker = await db('workers').where({ id: registro.worker_id }).first();
  const horario = await resolverHorarioDelDia(registro.worker_id, registro.fecha);
  const { extra25, extra35 } =
    nuevaSalida && worker.horas_extra_activas
      ? calcularHorasExtra({
          horaSalida: nuevaSalida,
          horaSalidaProgramada: horario && !horario.libre ? horario.horaSalida : null
        })
      : { extra25: 0, extra35: 0 };

  const [actualizado] = await db('attendance')
    .where({ id, empresa_id: empresaId })
    .update({
      creado_en: nuevaEntrada,
      hora_salida: nuevaSalida,
      horas_extra_25: extra25,
      horas_extra_35: extra35,
      horas_extra_estado: 'pendiente',
      horas_extra_aprobado_por: null,
      horas_extra_aprobado_en: null,
      editado_por: adminId,
      editado_en: db.fn.now()
    })
    .returning('*');
  return actualizado;
}

async function cambiarEstadoHorasExtra(id, estado, adminId, empresaId) {
  const [actualizado] = await db('attendance')
    .where({ id, empresa_id: empresaId })
    .update({
      horas_extra_estado: estado,
      horas_extra_aprobado_por: adminId,
      horas_extra_aprobado_en: db.fn.now()
    })
    .returning('*');
  return actualizado;
}

// Asistencia de hoy de UNA sucursal: las marcaciones hechas con el QR de esa
// sucursal. Los registros anteriores a las sucursales (sucursal_id NULL) se
// cuentan como de la Principal.
async function listarAsistenciaDeHoy(empresaId, sucursal) {
  const fecha = hoyLima();
  return listarAsistencia({
    empresaId,
    desde: fecha,
    hasta: fecha,
    marcadaEn: sucursal ? { id: sucursal.id, esPrincipal: Boolean(sucursal.esPrincipal) } : null
  });
}

// Reporte del historial: rango de fechas (inclusive) de UNA empresa, con
// filtro opcional por trabajador, por sucursal asignada al trabajador
// (sucursalAsignadaId) o por sucursal donde se marco (marcadaEn).
async function listarAsistencia({ empresaId, desde, hasta, workerId, sucursalAsignadaId, marcadaEn }) {
  const query = db('attendance')
    .join('workers', 'workers.id', 'attendance.worker_id')
    .leftJoin('sucursales', 'sucursales.id', 'attendance.sucursal_id')
    .where('attendance.empresa_id', empresaId)
    .andWhere('attendance.fecha', '>=', desde)
    .andWhere('attendance.fecha', '<=', hasta)
    .select(COLUMNAS_ASISTENCIA)
    .orderBy('attendance.fecha', 'desc')
    .orderBy('attendance.creado_en', 'asc');

  if (workerId) {
    query.andWhere('attendance.worker_id', workerId);
  }
  if (sucursalAsignadaId) {
    query.andWhere('workers.sucursal_id', sucursalAsignadaId);
  }
  if (marcadaEn) {
    query.andWhere((qb) => {
      qb.where('attendance.sucursal_id', marcadaEn.id);
      if (marcadaEn.esPrincipal) qb.orWhereNull('attendance.sucursal_id');
    });
  }

  return query;
}

async function listarHistorialDeWorker({ workerId, desde, hasta }) {
  return db('attendance')
    .where('worker_id', workerId)
    .andWhere('fecha', '>=', desde)
    .andWhere('fecha', '<=', hasta)
    .select(
      'id',
      'worker_id',
      'fecha',
      'creado_en',
      'hora_salida',
      'horas_extra_25',
      'horas_extra_35',
      'horas_extra_estado'
    )
    .orderBy('fecha', 'desc');
}

module.exports = {
  buscarOCrearWorker,
  vincularDispositivo,
  buscarAsistenciaDeHoy,
  marcarEntrada,
  marcarSalida,
  marcarRefrigerioSalida,
  marcarRefrigerioRegreso,
  editarRegistro,
  cambiarEstadoHorasExtra,
  listarAsistenciaDeHoy,
  listarAsistencia,
  listarHistorialDeWorker
};
