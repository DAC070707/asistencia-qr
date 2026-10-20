const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const env = require('../config/env');
const { errorDeNuevaPassword, generarTemporal } = require('../utils/password');

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 1000 * 60 * 60 * 12 // 12 horas
};

function paginaLogin(req, res) {
  res.render('superadmin/login');
}

function paginaDashboard(req, res) {
  res.render('superadmin/dashboard', { superAdmin: req.superAdmin });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y password son requeridos' });
  }

  const superAdmin = await db('super_admins')
    .where({ email: String(email).toLowerCase() })
    .first();
  if (!superAdmin) {
    return res.status(401).json({ error: 'Credenciales invalidas' });
  }

  const ok = await bcrypt.compare(password, superAdmin.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Credenciales invalidas' });
  }

  emitirSesion(res, superAdmin);
  return res.json({ id: superAdmin.id, email: superAdmin.email });
}

function emitirSesion(res, superAdmin) {
  const token = jwt.sign(
    { superAdminId: superAdmin.id, email: superAdmin.email },
    env.jwtSecret,
    { expiresIn: '12h' }
  );
  res.cookie('superadmin_token', token, COOKIE_OPTS);
}

function logout(req, res) {
  res.clearCookie('superadmin_token');
  return res.json({ ok: true });
}

async function listarEmpresas(req, res) {
  const empresas = await db('empresas')
    .select(
      'empresas.*',
      db.raw(
        '(SELECT COUNT(*) FROM workers WHERE workers.empresa_id = empresas.id) AS trabajadores'
      ),
      db.raw(
        '(SELECT COUNT(*) FROM attendance WHERE attendance.empresa_id = empresas.id) AS marcaciones'
      )
    )
    .orderBy('empresas.creado_en', 'desc');
  const admins = await db('admins')
    .whereNull('eliminado_en')
    .select('id', 'email', 'nombre', 'rol', 'activo', 'empresa_id', 'debe_cambiar_password')
    .orderByRaw("CASE WHEN rol = 'principal' THEN 0 ELSE 1 END, email");
  for (const e of empresas) {
    e.admins = admins
      .filter((a) => a.empresa_id === e.id)
      .map((a) => ({ id: a.id, email: a.email, nombre: a.nombre, rol: a.rol, activo: a.activo, debeCambiarPassword: a.debe_cambiar_password }));
  }
  res.json(empresas);
}

const ESTADOS_CUENTA = ['activa', 'pago_pendiente', 'suspendida'];

// Activa / pago pendiente (solo aviso) / suspendida (bloquea panel y marcacion).
// No borra nada: al reactivar todo vuelve a funcionar igual.
async function cambiarEstadoEmpresa(req, res) {
  const { estadoCuenta } = req.body || {};
  if (!ESTADOS_CUENTA.includes(estadoCuenta)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  const [empresa] = await db('empresas')
    .where({ id: req.params.id })
    .update({ estado_cuenta: estadoCuenta, activo: estadoCuenta !== 'suspendida', estado_cuenta_en: db.fn.now() })
    .returning(['id', 'nombre', 'estado_cuenta', 'activo']);
  if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
  res.json(empresa);
}

// Cuantos usuarios adicionales puede crear el admin principal de la empresa.
async function cambiarLimiteUsuarios(req, res) {
  const limite = Number(req.body?.limite);
  if (!Number.isInteger(limite) || limite < 0 || limite > 20) {
    return res.status(400).json({ error: 'El límite debe ser un entero entre 0 y 20' });
  }
  const [empresa] = await db('empresas')
    .where({ id: req.params.id })
    .update({ limite_usuarios_adicionales: limite })
    .returning(['id', 'limite_usuarios_adicionales']);
  if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
  res.json(empresa);
}

// Genera una contrasena temporal para un admin que olvido la suya. Se
// devuelve una sola vez; el admin debe cambiarla al entrar y sus sesiones
// abiertas se cierran.
async function restablecerPasswordAdmin(req, res) {
  const admin = await db('admins').where({ id: req.params.id }).first('id', 'email');
  if (!admin) return res.status(404).json({ error: 'Admin no encontrado' });
  const temporal = generarTemporal();
  await db('admins')
    .where({ id: admin.id })
    .update({
      password_hash: await bcrypt.hash(temporal, 10),
      password_cambiado_en: new Date(Math.floor(Date.now() / 1000) * 1000),
      debe_cambiar_password: true
    });
  res.json({ email: admin.email, passwordTemporal: temporal });
}

// El super-admin cambia su propia contrasena.
async function cambiarPassword(req, res) {
  const { actual, nueva, confirmacion } = req.body || {};
  const superAdmin = await db('super_admins').where({ id: req.superAdmin.id }).first();
  if (!superAdmin || !actual || !(await bcrypt.compare(String(actual), superAdmin.password_hash))) {
    return res.status(400).json({ error: 'La contraseña actual no es correcta' });
  }
  const error = errorDeNuevaPassword(nueva, confirmacion);
  if (error) return res.status(400).json({ error });
  if (await bcrypt.compare(nueva, superAdmin.password_hash)) {
    return res.status(400).json({ error: 'La nueva contraseña debe ser distinta de la actual' });
  }
  await db('super_admins')
    .where({ id: superAdmin.id })
    .update({ password_hash: await bcrypt.hash(nueva, 10), password_cambiado_en: new Date(Math.floor(Date.now() / 1000) * 1000) });
  emitirSesion(res, superAdmin);
  res.json({ ok: true });
}

async function crearEmpresa(req, res) {
  const { nombreEmpresa, adminEmail, adminPassword } = req.body;

  if (!nombreEmpresa || !nombreEmpresa.trim()) {
    return res.status(400).json({ error: 'El nombre de la empresa es requerido' });
  }
  if (!adminEmail || !adminPassword) {
    return res.status(400).json({ error: 'Email y password del admin son requeridos' });
  }
  if (adminPassword.length < 8) {
    return res.status(400).json({ error: 'La password debe tener al menos 8 caracteres' });
  }

  const emailNormalizado = String(adminEmail).toLowerCase();
  const yaExiste = await db('admins').where({ email: emailNormalizado }).first();
  if (yaExiste) {
    return res.status(409).json({ error: 'Ya existe un admin con ese email' });
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const resultado = await db.transaction(async (trx) => {
    const [empresa] = await trx('empresas').insert({ nombre: nombreEmpresa.trim() }).returning('*');
    const [admin] = await trx('admins')
      .insert({ email: emailNormalizado, password_hash: passwordHash, empresa_id: empresa.id })
      .returning('*');
    await trx('sucursales').insert({ empresa_id: empresa.id, nombre: 'Principal' });
    return { empresa, admin };
  });

  res.status(201).json({
    empresa: resultado.empresa,
    admin: { id: resultado.admin.id, email: resultado.admin.email }
  });
}

module.exports = {
  paginaLogin,
  paginaDashboard,
  login,
  logout,
  listarEmpresas,
  crearEmpresa,
  cambiarEstadoEmpresa,
  cambiarLimiteUsuarios,
  restablecerPasswordAdmin,
  cambiarPassword
};
