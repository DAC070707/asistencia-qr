const jwt = require('jsonwebtoken');
const env = require('../config/env');
const dailyCodeService = require('../services/dailyCode.service');
const attendanceService = require('../services/attendance.service');
const db = require('../config/db');
const { horaLima, hoyLima, primerDiaMesLima } = require('../utils/limaDate');
const { calcularHorasPendientes } = require('../utils/overtime');

const DEVICE_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 1000 * 60 * 60 * 24 * 365 // 1 año
};

function setDeviceCookie(res, workerId, empresaId) {
  const token = jwt.sign({ workerId, empresaId }, env.jwtSecret, { expiresIn: '365d' });
  res.cookie('worker_token', token, DEVICE_COOKIE_OPTS);
}

// Si se pasa empresaId, solo reconoce al trabajador cuando la cookie es de
// ESA empresa (la del QR que se acaba de escanear). Esto es lo que permite
// que un mismo celular marque asistencia en dos negocios distintos sin
// mezclar los datos: si la cookie es de otra empresa, se trata como "sin
// identificar" y se vuelve a pedir nombre+DNI (creando/encontrando el
// registro correcto dentro de la empresa nueva). Sin empresaId (usado por
// /mi-historial) simplemente reconoce lo que haya en la cookie.
async function workerDesdeCookie(req, empresaId) {
  const token = req.cookies?.worker_token;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (empresaId !== undefined && payload.empresaId !== empresaId) return null;

    const worker = await db('workers')
      .where({ id: payload.workerId, empresa_id: payload.empresaId, activo: true })
      .first();
    return worker || null;
  } catch (err) {
    return null;
  }
}

function datosParaVistaMarcar(worker, token, empresaId, registro, error) {
  return {
    token,
    nombre: worker.nombre,
    logoEmpresaUrl: `/logo/${empresaId}`,
    horaEntrada: registro ? horaLima(new Date(registro.creado_en)) : null,
    horaSalida: registro?.hora_salida ? horaLima(new Date(registro.hora_salida)) : null,
    error: error || null
  };
}

async function mostrarCheckin(req, res) {
  const { token } = req.params;
  const codigo = await dailyCodeService.validarToken(token);
  if (!codigo) {
    return res.render('checkin/codigo-invalido');
  }

  const worker = await workerDesdeCookie(req, codigo.empresa_id);
  if (!worker) {
    return res.render('checkin/form', { token, logoEmpresaUrl: `/logo/${codigo.empresa_id}` });
  }

  const registro = await attendanceService.buscarAsistenciaDeHoy(worker.id);
  return res.render(
    'checkin/marcar',
    datosParaVistaMarcar(worker, token, codigo.empresa_id, registro)
  );
}

async function identificar(req, res) {
  const { token } = req.params;
  const codigo = await dailyCodeService.validarToken(token);
  if (!codigo) {
    return res.render('checkin/codigo-invalido');
  }

  const logoEmpresaUrl = `/logo/${codigo.empresa_id}`;
  const dni = String(req.body.dni || '').trim();
  const nombre = String(req.body.nombre || '').trim();

  if (!/^\d{8}$/.test(dni)) {
    return res.render('checkin/form', {
      token,
      logoEmpresaUrl,
      error: 'Ingresa un DNI valido de 8 digitos'
    });
  }
  if (nombre.length < 3) {
    return res.render('checkin/form', { token, logoEmpresaUrl, error: 'Ingresa tu nombre completo' });
  }

  const worker = await attendanceService.buscarOCrearWorker({
    dni,
    nombre,
    empresaId: codigo.empresa_id
  });
  if (!worker.activo) {
    return res.render('checkin/form', {
      token,
      logoEmpresaUrl,
      error: 'Tu registro esta inactivo. Contacta al administrador.'
    });
  }

  setDeviceCookie(res, worker.id, codigo.empresa_id);

  const registro = await attendanceService.buscarAsistenciaDeHoy(worker.id);
  return res.render(
    'checkin/marcar',
    datosParaVistaMarcar(worker, token, codigo.empresa_id, registro)
  );
}

async function marcar(req, res) {
  const { token } = req.params;
  const codigo = await dailyCodeService.validarToken(token);
  if (!codigo) {
    return res.render('checkin/codigo-invalido');
  }

  const worker = await workerDesdeCookie(req, codigo.empresa_id);
  if (!worker) {
    return res.render('checkin/form', { token, logoEmpresaUrl: `/logo/${codigo.empresa_id}` });
  }

  const accion = req.body.accion;

  if (accion === 'entrada') {
    const { registro, yaExistia } = await attendanceService.marcarEntrada({
      workerId: worker.id,
      dailyCodeId: codigo.id,
      empresaId: codigo.empresa_id
    });
    return res.render('checkin/confirmado', {
      nombre: worker.nombre,
      logoEmpresaUrl: `/logo/${codigo.empresa_id}`,
      tipo: 'entrada',
      hora: horaLima(new Date(registro.creado_en)),
      yaExistia
    });
  }

  if (accion === 'salida') {
    const resultado = await attendanceService.marcarSalida({ workerId: worker.id });

    if (resultado.error === 'sin_entrada') {
      return res.render(
        'checkin/marcar',
        datosParaVistaMarcar(worker, token, codigo.empresa_id, null, 'Primero marca tu entrada de hoy.')
      );
    }

    return res.render('checkin/confirmado', {
      nombre: worker.nombre,
      logoEmpresaUrl: `/logo/${codigo.empresa_id}`,
      tipo: 'salida',
      hora: horaLima(new Date(resultado.registro.hora_salida)),
      yaExistia: resultado.yaExistia
    });
  }

  return res.status(400).send('Accion invalida');
}

async function historialWorker(req, res) {
  const worker = await workerDesdeCookie(req);
  if (!worker) {
    return res.render('checkin/sin-identificar');
  }

  const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
  let desde = req.query.desde;
  let hasta = req.query.hasta;
  if (!desde || !hasta || !FECHA_REGEX.test(desde) || !FECHA_REGEX.test(hasta) || desde > hasta) {
    desde = primerDiaMesLima();
    hasta = hoyLima();
  }

  const registros = await attendanceService.listarHistorialDeWorker({
    workerId: worker.id,
    desde,
    hasta
  });

  let totalAprobado25 = 0;
  let totalAprobado35 = 0;
  for (const r of registros) {
    if (r.horas_extra_estado === 'aprobado') {
      totalAprobado25 += Number(r.horas_extra_25);
      totalAprobado35 += Number(r.horas_extra_35);
    }
  }

  return res.render('checkin/mi-historial', {
    nombre: worker.nombre,
    logoEmpresaUrl: `/logo/${worker.empresa_id}`,
    desde,
    hasta,
    totalAprobado25: totalAprobado25.toFixed(2),
    totalAprobado35: totalAprobado35.toFixed(2),
    registros: registros.map((r) => ({
      fecha: new Date(r.fecha).toISOString().slice(0, 10),
      horaEntrada: horaLima(new Date(r.creado_en)),
      horaSalida: r.hora_salida ? horaLima(new Date(r.hora_salida)) : '—',
      horasPendientes: calcularHorasPendientes({
        fecha: r.fecha,
        horaSalida: r.hora_salida,
        horaSalidaProgramada: worker.hora_salida_programada
      }),
      horasExtra25: Number(r.horas_extra_25),
      horasExtra35: Number(r.horas_extra_35),
      estado: r.horas_extra_estado
    }))
  });
}

module.exports = { mostrarCheckin, identificar, marcar, historialWorker };
