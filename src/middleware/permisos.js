// Permisos de los usuarios del panel. El admin principal tiene todos y es el
// unico que administra usuarios; los adicionales tienen 'ver' mas los que el
// principal les asigne.
const PERMISOS = [
  'corregir_marcaciones',
  'aprobar_horas_extra',
  'gestionar_horarios',
  'gestionar_trabajadores',
  'administrar_qr',
  'configuracion'
];

function tienePermiso(admin, clave) {
  if (!admin) return false;
  if (admin.rol === 'principal') return true;
  if (clave === 'ver') return true;
  return Array.isArray(admin.permisos) && admin.permisos.includes(clave);
}

function denegar(req, res) {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(403).json({ error: 'No tienes permiso para esta acción' });
  }
  return res.status(403).render('admin/sin-permiso', { empresaNombre: res.locals.empresaNombre || '' });
}

// Requiere al menos uno de los permisos indicados.
function requirePermiso(...claves) {
  return (req, res, next) => (claves.some((c) => tienePermiso(req.admin, c)) ? next() : denegar(req, res));
}

function requirePrincipal(req, res, next) {
  return req.admin && req.admin.rol === 'principal' ? next() : denegar(req, res);
}

// Plantillas de turno: son de toda la empresa, asi que un usuario limitado a
// una sucursal no puede crearlas ni editarlas.
function requireSinRestriccionDeSucursal(req, res, next) {
  return req.admin && !req.admin.sucursalId ? next() : denegar(req, res);
}

module.exports = { PERMISOS, tienePermiso, requirePermiso, requirePrincipal, requireSinRestriccionDeSucursal };
