const db = require('../config/db');
const { hoyLima } = require('../utils/limaDate');

async function buscarOCrearWorker({ dni, nombre }) {
  const existente = await db('workers').where({ dni }).first();
  if (existente) return existente;

  const [creado] = await db('workers').insert({ dni, nombre }).returning('*');
  return creado;
}

async function buscarAsistenciaDeHoy(workerId) {
  const fecha = hoyLima();
  return db('attendance').where({ worker_id: workerId, fecha }).first();
}

async function marcarEntrada({ workerId, dailyCodeId }) {
  const fecha = hoyLima();

  // Ya marco entrada hoy: no duplicar, devolver el registro existente.
  const existente = await buscarAsistenciaDeHoy(workerId);
  if (existente) return { registro: existente, yaExistia: true };

  const [creado] = await db('attendance')
    .insert({ worker_id: workerId, daily_code_id: dailyCodeId, fecha })
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

  const [actualizado] = await db('attendance')
    .where({ id: existente.id })
    .update({ hora_salida: db.fn.now() })
    .returning('*');
  return { registro: actualizado, yaExistia: false };
}

async function listarAsistenciaDeHoy() {
  const fecha = hoyLima();
  return listarAsistenciaPorFecha(fecha);
}

async function listarAsistenciaPorFecha(fecha) {
  return db('attendance')
    .join('workers', 'workers.id', 'attendance.worker_id')
    .where('attendance.fecha', fecha)
    .select(
      'attendance.id',
      'workers.dni',
      'workers.nombre',
      'attendance.creado_en',
      'attendance.hora_salida',
      'attendance.fecha'
    )
    .orderBy('attendance.creado_en', 'asc');
}

module.exports = {
  buscarOCrearWorker,
  buscarAsistenciaDeHoy,
  marcarEntrada,
  marcarSalida,
  listarAsistenciaDeHoy,
  listarAsistenciaPorFecha
};
