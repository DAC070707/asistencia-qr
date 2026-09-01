const dailyCodeService = require('../services/dailyCode.service');
const qrImageService = require('../services/qrImage.service');
const attendanceService = require('../services/attendance.service');
const db = require('../config/db');
const { hoyLima, limaLocalInputToDate } = require('../utils/limaDate');

const ESTADOS_HORAS_EXTRA = ['pendiente', 'aprobado', 'rechazado'];

function paginaLogin(req, res) {
  res.render('admin/login');
}

function paginaDashboard(req, res) {
  res.render('admin/dashboard', { admin: req.admin });
}

function paginaHistorial(req, res) {
  res.render('admin/historial', { admin: req.admin });
}

function paginaTrabajadores(req, res) {
  res.render('admin/trabajadores', { admin: req.admin });
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

  const formatoHora = (valor) =>
    valor
      ? new Intl.DateTimeFormat('es-PE', {
          timeZone: 'America/Lima',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        }).format(new Date(valor))
      : '';

  const filas = [
    [
      'DNI',
      'Nombre',
      'Fecha',
      'Hora entrada (Lima)',
      'Hora salida (Lima)',
      'Horas extra 25%',
      'Horas extra 35%',
      'Estado horas extra'
    ]
  ];
  for (const r of registros) {
    filas.push([
      r.dni,
      r.nombre,
      fecha,
      formatoHora(r.creado_en),
      formatoHora(r.hora_salida),
      r.horas_extra_25,
      r.horas_extra_35,
      r.horas_extra_estado
    ]);
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

const HORA_REGEX = /^\d{2}:\d{2}(:\d{2})?$/;

async function actualizarWorker(req, res) {
  const { id } = req.params;
  const { activo, nombre, hora_entrada_programada, hora_salida_programada } = req.body;

  const cambios = {};
  if (typeof activo === 'boolean') cambios.activo = activo;
  if (typeof nombre === 'string' && nombre.trim()) cambios.nombre = nombre.trim();

  for (const [campo, valor] of [
    ['hora_entrada_programada', hora_entrada_programada],
    ['hora_salida_programada', hora_salida_programada]
  ]) {
    if (valor === null || valor === '') {
      cambios[campo] = null;
    } else if (typeof valor === 'string' && HORA_REGEX.test(valor)) {
      cambios[campo] = valor;
    } else if (valor !== undefined) {
      return res.status(400).json({ error: `${campo} debe tener formato HH:MM` });
    }
  }

  if (Object.keys(cambios).length === 0) {
    return res.status(400).json({ error: 'Nada que actualizar' });
  }

  const [actualizado] = await db('workers').where({ id }).update(cambios).returning('*');
  if (!actualizado) {
    return res.status(404).json({ error: 'Trabajador no encontrado' });
  }
  res.json(actualizado);
}

async function editarAsistencia(req, res) {
  const { id } = req.params;
  const { hora_entrada, hora_salida } = req.body;

  const horaEntrada = hora_entrada ? limaLocalInputToDate(hora_entrada) : null;
  const horaSalida = hora_salida ? limaLocalInputToDate(hora_salida) : null;

  if ((hora_entrada && isNaN(horaEntrada)) || (hora_salida && isNaN(horaSalida))) {
    return res.status(400).json({ error: 'Fecha/hora invalida' });
  }

  const actualizado = await attendanceService.editarRegistro(
    id,
    { horaEntrada, horaSalida },
    req.admin.id
  );
  if (!actualizado) {
    return res.status(404).json({ error: 'Registro no encontrado' });
  }
  res.json(actualizado);
}

async function cambiarEstadoHorasExtra(req, res) {
  const { id } = req.params;
  const { estado } = req.body;

  if (!ESTADOS_HORAS_EXTRA.includes(estado) || estado === 'pendiente') {
    return res.status(400).json({ error: 'Estado invalido, usa "aprobado" o "rechazado"' });
  }

  const actualizado = await attendanceService.cambiarEstadoHorasExtra(id, estado, req.admin.id);
  if (!actualizado) {
    return res.status(404).json({ error: 'Registro no encontrado' });
  }
  res.json(actualizado);
}

module.exports = {
  paginaLogin,
  paginaDashboard,
  paginaHistorial,
  paginaTrabajadores,
  qrDeHoy,
  qrDeHoyImagen,
  regenerarQr,
  asistenciaDeHoy,
  asistenciaPorFecha,
  exportarCsv,
  listarWorkers,
  actualizarWorker,
  editarAsistencia,
  cambiarEstadoHorasExtra
};
