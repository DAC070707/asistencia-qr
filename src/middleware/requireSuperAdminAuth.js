const jwt = require('jsonwebtoken');
const env = require('../config/env');
const db = require('../config/db');
const { tokenAnteriorAlCambio } = require('../utils/password');

async function requireSuperAdminAuth(req, res, next) {
  const token = req.cookies?.superadmin_token;
  if (!token) {
    return redirectOrJson(req, res);
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (err) {
    return redirectOrJson(req, res);
  }
  if (!payload.superAdminId) {
    return redirectOrJson(req, res);
  }

  try {
    // Cierra las sesiones abiertas con una contrasena anterior.
    const superAdmin = await db('super_admins').where({ id: payload.superAdminId }).first('id', 'email', 'password_cambiado_en');
    if (!superAdmin || tokenAnteriorAlCambio(payload.iat, superAdmin.password_cambiado_en)) {
      res.clearCookie('superadmin_token');
      return redirectOrJson(req, res);
    }
    req.superAdmin = { id: superAdmin.id, email: superAdmin.email };
    return next();
  } catch (err) {
    return next(err);
  }
}

function redirectOrJson(req, res) {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  return res.redirect('/superadmin/login');
}

module.exports = requireSuperAdminAuth;
