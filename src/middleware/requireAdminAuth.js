const jwt = require('jsonwebtoken');
const env = require('../config/env');
const db = require('../config/db');
const { tokenAnteriorAlCambio } = require('../utils/password');

// Ademas de validar el token, en cada peticion se revisa:
// - que la sesion no sea anterior a un cambio de contrasena (se cierran las
//   sesiones abiertas con la contrasena anterior);
// - el estado de la cuenta de la empresa: si esta suspendida se bloquea el
//   panel (pantalla "Servicio suspendido" / 403 en la API); si tiene el pago
//   pendiente se deja pasar con el aviso en res.locals.
async function requireAdminAuth(req, res, next) {
  const token = req.cookies?.admin_token;
  if (!token) {
    return redirectOrJson(req, res);
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (err) {
    return redirectOrJson(req, res);
  }

  try {
    const fila = await db('admins')
      .join('empresas', 'empresas.id', 'admins.empresa_id')
      .where('admins.id', payload.adminId)
      .first(
        'admins.id',
        'admins.email',
        'admins.empresa_id',
        'admins.password_cambiado_en',
        'admins.debe_cambiar_password',
        'empresas.estado_cuenta'
      );
    if (!fila || tokenAnteriorAlCambio(payload.iat, fila.password_cambiado_en)) {
      res.clearCookie('admin_token');
      return redirectOrJson(req, res);
    }

    if (fila.estado_cuenta === 'suspendida') {
      if (req.originalUrl.startsWith('/api/')) {
        return res.status(403).json({ error: 'El servicio de tu empresa está suspendido. Comunícate con Dana para reactivarlo.', suspendida: true });
      }
      return res.status(403).render('admin/suspendida');
    }

    req.admin = { id: fila.id, email: fila.email, empresaId: fila.empresa_id };
    res.locals.estadoCuenta = fila.estado_cuenta;
    res.locals.debeCambiarPassword = Boolean(fila.debe_cambiar_password);
    return next();
  } catch (err) {
    return next(err);
  }
}

function redirectOrJson(req, res) {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  return res.redirect('/admin/login');
}

module.exports = requireAdminAuth;
