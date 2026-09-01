const jwt = require('jsonwebtoken');
const env = require('../config/env');

function requireSuperAdminAuth(req, res, next) {
  const token = req.cookies?.superadmin_token;
  if (!token) {
    return redirectOrJson(req, res);
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (!payload.superAdminId) {
      return redirectOrJson(req, res);
    }
    req.superAdmin = { id: payload.superAdminId, email: payload.email };
    return next();
  } catch (err) {
    return redirectOrJson(req, res);
  }
}

function redirectOrJson(req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  return res.redirect('/superadmin/login');
}

module.exports = requireSuperAdminAuth;
