const dailyCodeService = require('../services/dailyCode.service');
const qrImageService = require('../services/qrImage.service');
const attendanceService = require('../services/attendance.service');
const db = require('../config/db');
const { hoyLima, limaLocalInputToDate } = require('../utils/limaDate');

const ESTADOS_HORAS_EXTRA = ['pendiente', 'aprobado', 'rechazado'];
const HORA_REGEX = /^\d{2}:\d{2}(:\d{2})?$/;

async function subirLogo(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió ningún archivo' });
  }

  await db('empresas')
    .where({ id: req.admin.empresaId })
    .update({ logo_data: req.file.buffer, logo_mime: req.file.mimetype });

  res.json({ url: `/logo/${req.admin.empresaId}?v=${Date.now()}` });
}

async function servirLogo(req, res) {
  const { empresaId } = req.params;
  const empresa = await db('empresas').where({ id: empresaId }).first();
  if (!empresa || !empresa.logo_data) {
    return res.status(404).send('Sin logo');
  }
  res.set('Content-Type', empresa.logo_mime);
  res.set('Cache-Control', 'public, max-age=300');
  res.send(empresa.logo_data);
}

function paginaLogin(req, res) {
  res.render('admin/login');
}

function paginaDashboard(req, res) {
  res.render('admin/dashboard', { admin: req.admin, logoEmpresaUrl: `/logo/${req.admin.empresaId}` });
}

function paginaHistorial(req, res) {
  res.render('admin/historial', { admin: req.admin, logoEmpresaUrl: `/logo/${req.admin.empresaId}` });
}

function paginaTrabajadores(req, res) {
  res.render('admin/trabajadores', {
    admin: req.admin,
    logoEmpresaUrl: `/logo/${req.admin.empresaId}`
  });
}

async function qrDeHoy(req, res) {
  const codigo = await dailyCodeService.obtenerOCrearCodigoDeHoy(req.admin.empresaId);
  res.json({
    fecha: codigo.fecha,
    token: codigo.token,
    url: qrImageService.urlCheckin(codigo.token)
  });
}

async function qrDeHoyImagen(req, res) {
  const codigo = await dailyCodeService.obtenerOCrearCodigoDeHoy(req.admin.empresaId);
  const buffer = await qrImageService.generarPngBuffer(codigo.token);
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'no-store');
  res.send(buffer);
}

async function regenerarQr(req, res) {
  const codigo = await dailyCodeService.regenerarCodigoDeHoy(req.admin.empresaId, req.admin.id);
  res.json({
    fecha: codigo.fecha,
    token: codigo.token,
    url: qrImageService.urlCheckin(codigo.token)
  });
}

async function asistenciaDeHoy(req, res) {
  const registros = await attendanceService.listarAsistenciaDeHoy(req.admin.empresaId);
  res.json(registros);
}

function parametrosRango(query) {
  const hoy = hoyLima();
  const desde = query.desde || query.fecha || hoy;
  const hasta = query.hasta || query.fecha || hoy;
  const workerId = query.worker_id || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return { error: 'Formato de fecha invalido, usa YYYY-MM-DD' };
  }
  if (desde > hasta) {
    return { error: 'La fecha "desde" no puede ser posterior a "hasta"' };
  }
  return { desde, hasta, workerId };
}

async function asistenciaPorFecha(req, res) {
  const rango = parametrosRango(req.query);
  if (rango.error) {
    return res.status(400).json({ error: rango.error });
  }
  const registros = await attendanceService.listarAsistencia({
    empresaId: req.admin.empresaId,
    ...rango
  });
  res.json(registros);
}

async function exportarCsv(req, res) {
  const rango = parametrosRango(req.query);
  if (rango.error) {
    return res.status(400).json({ error: rango.error });
  }
  const { desde, hasta } = rango;

  const registros = await attendanceService.listarAsistencia({
    empresaId: req.admin.empresaId,
    ...rango
  });

  const formatoFecha = (valor) => new Date(valor).toISOString().slice(0, 10);
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
      formatoFecha(r.fecha),
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

  const nombreArchivo = desde === hasta ? desde : `${desde}_a_${hasta}`;
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="asistencia_${nombreArchivo}.csv"`);
  res.send('﻿' + csv); // BOM para que Excel reconozca UTF-8
}

async function listarWorkers(req, res) {
  const workers = await db('workers')
    .where({ empresa_id: req.admin.empresaId })
    .orderBy('nombre', 'asc');
  res.json(workers);
}

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

  // El filtro por empresa_id evita que un admin edite (o detecte la
  // existencia de) un trabajador de otra empresa adivinando el id.
  const [actualizado] = await db('workers')
    .where({ id, empresa_id: req.admin.empresaId })
    .update(cambios)
    .returning('*');
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
    req.admin.id,
    req.admin.empresaId
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

  const actualizado = await attendanceService.cambiarEstadoHorasExtra(
    id,
    estado,
    req.admin.id,
    req.admin.empresaId
  );
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
  cambiarEstadoHorasExtra,
  subirLogo,
  servirLogo
};
