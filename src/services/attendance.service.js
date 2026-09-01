const db = require('../config/db');
const { hoyLima, primerDiaMesLima } = require('../utils/limaDate');
const { calcularHorasExtra } = require('../utils/overtime');

const COLUMNAS_ASISTENCIA = [
  'attendance.id',
  'workers.dni',
  'workers.nombre',
  'attendance.creado_en',
  'attendance.hora_salida',
  'attendance.fecha',
  'attendance.horas_extra_25',
  'attendance.horas_extra_35',
  'attendance.horas_extra_estado',
  'attendance.editado_en'
];

async function buscarOCrearWorker({ dni, nombre, empresaId }) {
  const existente = await db('workers').where({ dni, empresa_id: empresaId }).first();
  if (existente) return existente;

  const [creado] = await db('workers').insert({ dni, nombre, empresa_id: empresaId }).returning('*');
  return creado;
}

async function buscarAsistenciaDeHoy(workerId) {
  const fecha = hoyLima();
  return db('attendance').where({ worker_id: workerId, fecha }).first();
}

async function marcarEntrada({ workerId, dailyCodeId, empresaId }) {
  const fecha = hoyLima();

  // Ya marco entrada hoy: no duplicar, devolver el registro existente.
  const existente = await buscarAsistenciaDeHoy(workerId);
  if (existente) return { registro: existente, yaExistia: true };

  const [creado] = await db('attendance')
    .insert({ worker_id: workerId, daily_code_id: dailyCodeId, empresa_id: empresaId, fecha })
    .returning('*');
  return { registro: creado, yaExistia: false };
}

async function marcarSalida({ workerId }) {
  const existente = await buscarAsistenciaDeHoy(workerId);
  if (!existente) {
    return { error: 'sin_entrada' };
  }
  if (existente.hora_salida) {
    return { registro: existente, yaExistia: true };
  }

  const worker = await db('workers').where({ id: workerId }).first();
  const horaSalida = new Date();
  const { extra25, extra35 } = calcularHorasExtra({
    horaEntrada: existente.creado_en,
    horaSalida,
    horaEntradaProgramada: worker.hora_entrada_programada,
    horaSalidaProgramada: worker.hora_salida_programada
  });

  const [actualizado] = await db('attendance')
    .where({ id: existente.id })
    .update({ hora_salida: horaSalida, horas_extra_25: extra25, horas_extra_35: extra35 })
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
  const { extra25, extra35 } = nuevaSalida
    ? calcularHorasExtra({
        horaEntrada: nuevaEntrada,
        horaSalida: nuevaSalida,
        horaEntradaProgramada: worker.hora_entrada_programada,
        horaSalidaProgramada: worker.hora_salida_programada
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

async function listarAsistenciaDeHoy(empresaId) {
  const fecha = hoyLima();
  return listarAsistenciaPorFecha(fecha, empresaId);
}

async function listarAsistenciaPorFecha(fecha, empresaId) {
  return db('attendance')
    .join('workers', 'workers.id', 'attendance.worker_id')
    .where('attendance.fecha', fecha)
    .andWhere('attendance.empresa_id', empresaId)
    .select(COLUMNAS_ASISTENCIA)
    .orderBy('attendance.creado_en', 'asc');
}

async function listarHistorialMesDeWorker(workerId) {
  const desde = primerDiaMesLima();
  const hasta = hoyLima();
  return db('attendance')
    .where('worker_id', workerId)
    .andWhere('fecha', '>=', desde)
    .andWhere('fecha', '<=', hasta)
    .select(
      'id',
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
  buscarAsistenciaDeHoy,
  marcarEntrada,
  marcarSalida,
  editarRegistro,
  cambiarEstadoHorasExtra,
  listarAsistenciaDeHoy,
  listarAsistenciaPorFecha,
  listarHistorialMesDeWorker
};
