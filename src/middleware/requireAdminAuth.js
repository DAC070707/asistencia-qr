const jwt = require('jsonwebtoken');
const env = require('../config/env');

function requireAdminAuth(req, res, next) {
  const token = req.cookies?.admin_token;
  if (!token) {
    return redirectOrJson(req, res);
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.admin = { id: payload.adminId, email: payload.email };
    return next();
  } catch (err) {
    return redirectOrJson(req, res);
  }
}

function redirectOrJson(req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  return res.redirect('/admin/login');
}

module.exports = requireAdminAuth;
