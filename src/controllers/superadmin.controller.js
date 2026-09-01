const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const env = require('../config/env');

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

  const token = jwt.sign(
    { superAdminId: superAdmin.id, email: superAdmin.email },
    env.jwtSecret,
    { expiresIn: '12h' }
  );

  res.cookie('superadmin_token', token, COOKIE_OPTS);
  return res.json({ id: superAdmin.id, email: superAdmin.email });
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
  res.json(empresas);
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
    return { empresa, admin };
  });

  res.status(201).json({
    empresa: resultado.empresa,
    admin: { id: resultado.admin.id, email: resultado.admin.email }
  });
}

module.exports = { paginaLogin, paginaDashboard, login, logout, listarEmpresas, crearEmpresa };
