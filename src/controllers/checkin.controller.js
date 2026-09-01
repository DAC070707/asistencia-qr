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

  const existente = await attendanceService.buscarAsistenciaDeHoy(worker.id);
  if (existente) {
    return res.render('checkin/ya-marcado', {
      nombre: worker.nombre,
      hora: horaLima(new Date(existente.creado_en))
    });
  }

  const { registro } = await attendanceService.registrarAsistencia({
    workerId: worker.id,
    dailyCodeId: codigo.id
  });
  return res.render('checkin/confirmado', {
    nombre: worker.nombre,
    hora: horaLima(new Date(registro.creado_en))
  });
}

async function registrarCheckin(req, res) {
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

  const { registro, yaExistia } = await attendanceService.registrarAsistencia({
    workerId: worker.id,
    dailyCodeId: codigo.id
  });

  if (yaExistia) {
    return res.render('checkin/ya-marcado', {
      nombre: worker.nombre,
      hora: horaLima(new Date(registro.creado_en))
    });
  }
  return res.render('checkin/confirmado', {
    nombre: worker.nombre,
    hora: horaLima(new Date(registro.creado_en))
  });
}

module.exports = { mostrarCheckin, registrarCheckin };
