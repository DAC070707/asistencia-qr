const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const env = require('../config/env');
const { errorDeNuevaPassword } = require('../utils/password');

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 1000 * 60 * 60 * 12 // 12 horas
};

const MENSAJE_SUSPENDIDA = 'El servicio de tu empresa está suspendido. Comunícate con Dana para reactivarlo.';

function emitirSesion(res, admin) {
  const token = jwt.sign(
    { adminId: admin.id, email: admin.email, empresaId: admin.empresa_id },
    env.jwtSecret,
    { expiresIn: '12h' }
  );
  res.cookie('admin_token', token, COOKIE_OPTS);
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y password son requeridos' });
  }

  const admin = await db('admins').where({ email: String(email).toLowerCase() }).first();
  if (!admin) {
    return res.status(401).json({ error: 'Credenciales invalidas' });
  }

  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Credenciales invalidas' });
  }

  const empresa = await db('empresas').where({ id: admin.empresa_id }).first('estado_cuenta');
  if (empresa && empresa.estado_cuenta === 'suspendida') {
    return res.status(403).json({ error: MENSAJE_SUSPENDIDA, suspendida: true });
  }

  emitirSesion(res, admin);
  return res.json({
    id: admin.id,
    email: admin.email,
    empresaId: admin.empresa_id,
    debeCambiarPassword: Boolean(admin.debe_cambiar_password)
  });
}

function logout(req, res) {
  res.clearCookie('admin_token');
  return res.json({ ok: true });
}

function me(req, res) {
  return res.json({ ...req.admin, debeCambiarPassword: Boolean(res.locals.debeCambiarPassword) });
}

// El admin cambia su propia contrasena. Cierra las demas sesiones abiertas
// (password_cambiado_en) y renueva la de esta.
async function cambiarPassword(req, res) {
  const { actual, nueva, confirmacion } = req.body || {};
  const admin = await db('admins').where({ id: req.admin.id }).first();
  if (!admin || !actual || !(await bcrypt.compare(String(actual), admin.password_hash))) {
    return res.status(400).json({ error: 'La contraseña actual no es correcta' });
  }
  const error = errorDeNuevaPassword(nueva, confirmacion);
  if (error) return res.status(400).json({ error });
  if (await bcrypt.compare(nueva, admin.password_hash)) {
    return res.status(400).json({ error: 'La nueva contraseña debe ser distinta de la actual' });
  }

  await db('admins')
    .where({ id: admin.id })
    .update({
      password_hash: await bcrypt.hash(nueva, 10),
      password_cambiado_en: new Date(Math.floor(Date.now() / 1000) * 1000),
      debe_cambiar_password: false
    });
  emitirSesion(res, admin);
  return res.json({ ok: true });
}

module.exports = { login, logout, me, cambiarPassword };
