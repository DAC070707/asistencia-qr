const dailyCodeService = require('../services/dailyCode.service');
const qrImageService = require('../services/qrImage.service');
const attendanceService = require('../services/attendance.service');
const db = require('../config/db');
const { hoyLima } = require('../utils/limaDate');

function paginaLogin(req, res) {
  res.render('admin/login');
}

function paginaDashboard(req, res) {
  res.render('admin/dashboard', { admin: req.admin });
}

function paginaHistorial(req, res) {
  res.render('admin/historial', { admin: req.admin });
}

async function qrDeHoy(req, res) {
  const codigo = await dailyCodeService.obtenerOCrearCodigoDeHoy();
  res.json({
    fecha: codigo.fecha,
    token: codigo.token,
    url: qrImageService.urlCheckin(codigo.token)
  });
}

async function qrDeHoyImagen(req, res) {
  const codigo = await dailyCodeService.obtenerOCrearCodigoDeHoy();
  const buffer = await qrImageService.generarPngBuffer(codigo.token);
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'no-store');
  res.send(buffer);
}

async function regenerarQr(req, res) {
  const codigo = await dailyCodeService.regenerarCodigoDeHoy(req.admin.id);
  res.json({
    fecha: codigo.fecha,
    token: codigo.token,
    url: qrImageService.urlCheckin(codigo.token)
  });
}

async function asistenciaDeHoy(req, res) {
  const registros = await attendanceService.listarAsistenciaDeHoy();
  res.json(registros);
}

async function asistenciaPorFecha(req, res) {
  const fecha = req.query.fecha || hoyLima();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ error: 'Formato de fecha invalido, usa YYYY-MM-DD' });
  }
  const registros = await attendanceService.listarAsistenciaPorFecha(fecha);
  res.json(registros);
}

async function exportarCsv(req, res) {
  const fecha = req.query.fecha || hoyLima();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ error: 'Formato de fecha invalido, usa YYYY-MM-DD' });
  }

  const registros = await attendanceService.listarAsistenciaPorFecha(fecha);

  const filas = [['DNI', 'Nombre', 'Fecha', 'Hora registro (Lima)']];
  for (const r of registros) {
    const horaLimaStr = new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(new Date(r.creado_en));
    filas.push([r.dni, r.nombre, r.fecha, horaLimaStr]);
  }

  const csv = filas
    .map((fila) => fila.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="asistencia_${fecha}.csv"`);
  res.send('﻿' + csv); // BOM para que Excel reconozca UTF-8
}

async function listarWorkers(req, res) {
  const workers = await db('workers').orderBy('nombre', 'asc');
  res.json(workers);
}

async function actualizarWorker(req, res) {
  const { id } = req.params;
  const { activo, nombre } = req.body;

  const cambios = {};
  if (typeof activo === 'boolean') cambios.activo = activo;
  if (typeof nombre === 'string' && nombre.trim()) cambios.nombre = nombre.trim();

  if (Object.keys(cambios).length === 0) {
    return res.status(400).json({ error: 'Nada que actualizar' });
  }

  const [actualizado] = await db('workers').where({ id }).update(cambios).returning('*');
  if (!actualizado) {
    return res.status(404).json({ error: 'Trabajador no encontrado' });
  }
  res.json(actualizado);
}

module.exports = {
  paginaLogin,
  paginaDashboard,
  paginaHistorial,
  qrDeHoy,
  qrDeHoyImagen,
  regenerarQr,
  asistenciaDeHoy,
  asistenciaPorFecha,
  exportarCsv,
  listarWorkers,
  actualizarWorker
};
