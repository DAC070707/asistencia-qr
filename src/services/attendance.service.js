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

async function registrarAsistencia({ workerId, dailyCodeId }) {
  const fecha = hoyLima();

  // Ya marco hoy: no duplicar, devolver el registro existente.
  const existente = await buscarAsistenciaDeHoy(workerId);
  if (existente) return { registro: existente, yaExistia: true };

  const [creado] = await db('attendance')
    .insert({ worker_id: workerId, daily_code_id: dailyCodeId, fecha })
    .returning('*');
  return { registro: creado, yaExistia: false };
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
      'attendance.fecha'
    )
    .orderBy('attendance.creado_en', 'asc');
}

module.exports = {
  buscarOCrearWorker,
  buscarAsistenciaDeHoy,
  registrarAsistencia,
  listarAsistenciaDeHoy,
  listarAsistenciaPorFecha
};
