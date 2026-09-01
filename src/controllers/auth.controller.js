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

  const token = jwt.sign(
    { adminId: admin.id, email: admin.email, empresaId: admin.empresa_id },
    env.jwtSecret,
    { expiresIn: '12h' }
  );

  res.cookie('admin_token', token, COOKIE_OPTS);
  return res.json({ id: admin.id, email: admin.email, empresaId: admin.empresa_id });
}

function logout(req, res) {
  res.clearCookie('admin_token');
  return res.json({ ok: true });
}

function me(req, res) {
  return res.json(req.admin);
}

module.exports = { login, logout, me };
