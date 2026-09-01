const jwt = require('jsonwebtoken');
const env = require('../config/env');
const dailyCodeService = require('../services/dailyCode.service');
const attendanceService = require('../services/attendance.service');
const db = require('../config/db');
const { horaLima } = require('../utils/limaDate');

const DEVICE_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 1000 * 60 * 60 * 24 * 365 // 1 año
};

function setDeviceCookie(res, workerId) {
  const token = jwt.sign({ workerId }, env.jwtSecret, { expiresIn: '365d' });
  res.cookie('worker_token', token, DEVICE_COOKIE_OPTS);
}

async function workerDesdeCookie(req) {
  const token = req.cookies?.worker_token;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const worker = await db('workers').where({ id: payload.workerId, activo: true }).first();
    return worker || null;
  } catch (err) {
    return null;
  }
}

function datosParaVistaMarcar(worker, token, registro, error) {
  return {
    token,
    nombre: worker.nombre,
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

  const worker = await workerDesdeCookie(req);
  if (!worker) {
    return res.render('checkin/form', { token });
  }

  const registro = await attendanceService.buscarAsistenciaDeHoy(worker.id);
  return res.render('checkin/marcar', datosParaVistaMarcar(worker, token, registro));
}

async function identificar(req, res) {
  const { token } = req.params;
  const codigo = await dailyCodeService.validarToken(token);
  if (!codigo) {
    return res.render('checkin/codigo-invalido');
  }

  const dni = String(req.body.dni || '').trim();
  const nombre = String(req.body.nombre || '').trim();

  if (!/^\d{8}$/.test(dni)) {
    return res.render('checkin/form', { token, error: 'Ingresa un DNI valido de 8 digitos' });
  }
  if (nombre.length < 3) {
    return res.render('checkin/form', { token, error: 'Ingresa tu nombre completo' });
  }

  const worker = await attendanceService.buscarOCrearWorker({ dni, nombre });
  if (!worker.activo) {
    return res.render('checkin/form', {
      token,
      error: 'Tu registro esta inactivo. Contacta al administrador.'
    });
  }

  setDeviceCookie(res, worker.id);

  const registro = await attendanceService.buscarAsistenciaDeHoy(worker.id);
  return res.render('checkin/marcar', datosParaVistaMarcar(worker, token, registro));
}

async function marcar(req, res) {
  const { token } = req.params;
  const codigo = await dailyCodeService.validarToken(token);
  if (!codigo) {
    return res.render('checkin/codigo-invalido');
  }

  const worker = await workerDesdeCookie(req);
  if (!worker) {
    return res.render('checkin/form', { token });
  }

  const accion = req.body.accion;

  if (accion === 'entrada') {
    const { registro, yaExistia } = await attendanceService.marcarEntrada({
      workerId: worker.id,
      dailyCodeId: codigo.id
    });
    return res.render('checkin/confirmado', {
      nombre: worker.nombre,
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
        datosParaVistaMarcar(worker, token, null, 'Primero marca tu entrada de hoy.')
      );
    }

    return res.render('checkin/confirmado', {
      nombre: worker.nombre,
      tipo: 'salida',
      hora: horaLima(new Date(resultado.registro.hora_salida)),
      yaExistia: resultado.yaExistia
    });
  }

  return res.status(400).send('Accion invalida');
}

module.exports = { mostrarCheckin, identificar, marcar };
