const express = require('express');
const multer = require('multer');
const adminController = require('../controllers/admin.controller');
const requireAdminAuth = require('../middleware/requireAdminAuth');
const { requirePermiso, requirePrincipal, requireSinRestriccionDeSucursal } = require('../middleware/permisos');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

const MIME_LOGO_PERMITIDOS = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, MIME_LOGO_PERMITIDOS.includes(file.mimetype));
  }
});

// Paginas (EJS)
router.get('/admin/login', adminController.paginaLogin);
router.get('/admin', requireAdminAuth, asyncHandler(adminController.paginaDashboard));
router.get('/admin/historial', requireAdminAuth, asyncHandler(adminController.paginaHistorial));
router.get(
  '/admin/trabajadores',
  requireAdminAuth, requirePermiso('gestionar_trabajadores', 'gestionar_horarios'),
  asyncHandler(adminController.paginaTrabajadores)
);
router.get(
  '/admin/trabajadores/:id/horario',
  requireAdminAuth, requirePermiso('gestionar_horarios'),
  asyncHandler(adminController.paginaHorarioTrabajador)
);
router.get('/admin/turnos', requireAdminAuth, requirePermiso('gestionar_horarios'), asyncHandler(adminController.paginaTurnos));
router.get(
  '/admin/configuracion',
  requireAdminAuth,
  asyncHandler(adminController.paginaConfiguracion)
);

// API
router.get('/api/admin/qr/today', requireAdminAuth, asyncHandler(adminController.qrDeHoy));
router.get(
  '/api/admin/qr/today.png',
  requireAdminAuth,
  asyncHandler(adminController.qrDeHoyImagen)
);
router.post(
  '/api/admin/qr/regenerate',
  requireAdminAuth, requirePermiso('administrar_qr'),
  asyncHandler(adminController.regenerarQr)
);
router.get(
  '/api/admin/attendance/today',
  requireAdminAuth,
  asyncHandler(adminController.asistenciaDeHoy)
);
router.get(
  '/api/admin/attendance',
  requireAdminAuth,
  asyncHandler(adminController.asistenciaPorFecha)
);
router.get(
  '/api/admin/attendance/export.xlsx',
  requireAdminAuth,
  asyncHandler(adminController.exportarExcel)
);
router.get('/api/admin/workers', requireAdminAuth, asyncHandler(adminController.listarWorkers));
router.patch(
  '/api/admin/workers/:id',
  requireAdminAuth, requirePermiso('gestionar_trabajadores'),
  asyncHandler(adminController.actualizarWorker)
);
router.patch(
  '/api/admin/attendance/:id',
  requireAdminAuth, requirePermiso('corregir_marcaciones'),
  asyncHandler(adminController.editarAsistencia)
);
router.post(
  '/api/admin/attendance/:id/horas-extra',
  requireAdminAuth, requirePermiso('aprobar_horas_extra'),
  asyncHandler(adminController.cambiarEstadoHorasExtra)
);
router.post(
  '/api/admin/empresa/logo',
  requireAdminAuth, requirePermiso('configuracion'),
  uploadLogo.single('logo'),
  asyncHandler(adminController.subirLogo)
);

// Configuracion de la empresa (tolerancia de entrada, etc.)
router.get(
  '/api/admin/empresa/configuracion',
  requireAdminAuth,
  asyncHandler(adminController.obtenerConfiguracionEmpresa)
);
router.patch(
  '/api/admin/empresa/configuracion',
  requireAdminAuth, requirePermiso('configuracion'),
  asyncHandler(adminController.guardarConfiguracionEmpresa)
);

// Sucursales (QR, ubicacion y trabajadores por local)
router.get('/api/admin/sucursales', requireAdminAuth, asyncHandler(adminController.listarSucursales));
router.post('/api/admin/sucursales', requireAdminAuth, requirePermiso('configuracion'), asyncHandler(adminController.crearSucursal));
router.patch(
  '/api/admin/sucursales/:id',
  requireAdminAuth, requirePermiso('configuracion'),
  asyncHandler(adminController.actualizarSucursal)
);
router.get(
  '/api/admin/intentos-rechazados',
  requireAdminAuth, requirePermiso('configuracion'),
  asyncHandler(adminController.listarIntentosRechazados)
);

// Horarios del trabajador (versiones con fecha de vigencia)
router.get(
  '/api/admin/workers/:id/horarios',
  requireAdminAuth, requirePermiso('gestionar_horarios'),
  asyncHandler(adminController.listarHorariosTrabajador)
);
router.post(
  '/api/admin/workers/:id/horarios',
  requireAdminAuth, requirePermiso('gestionar_horarios'),
  asyncHandler(adminController.crearHorarioTrabajador)
);
router.put(
  '/api/admin/workers/:id/horarios/:versionId',
  requireAdminAuth, requirePermiso('gestionar_horarios'),
  asyncHandler(adminController.actualizarHorarioTrabajador)
);
router.delete(
  '/api/admin/workers/:id/horarios/:versionId',
  requireAdminAuth, requirePermiso('gestionar_horarios'),
  asyncHandler(adminController.eliminarHorarioTrabajador)
);

// Excepciones puntuales de horario
router.get(
  '/api/admin/workers/:id/excepciones',
  requireAdminAuth, requirePermiso('gestionar_horarios'),
  asyncHandler(adminController.listarExcepcionesTrabajador)
);
router.post(
  '/api/admin/workers/:id/excepciones',
  requireAdminAuth, requirePermiso('gestionar_horarios'),
  asyncHandler(adminController.crearExcepcionTrabajador)
);
router.delete(
  '/api/admin/workers/:id/excepciones/:excepcionId',
  requireAdminAuth, requirePermiso('gestionar_horarios'),
  asyncHandler(adminController.eliminarExcepcionTrabajador)
);

// Plantillas de turno (Nivel 2)
router.get('/api/admin/turnos', requireAdminAuth, requirePermiso('gestionar_horarios'), asyncHandler(adminController.listarTurnos));
router.post('/api/admin/turnos', requireAdminAuth, requirePermiso('gestionar_horarios'), requireSinRestriccionDeSucursal, asyncHandler(adminController.crearTurno));
router.patch(
  '/api/admin/turnos/:id',
  requireAdminAuth, requirePermiso('gestionar_horarios'), requireSinRestriccionDeSucursal,
  asyncHandler(adminController.actualizarTurno)
);
router.delete(
  '/api/admin/turnos/:id',
  requireAdminAuth, requirePermiso('gestionar_horarios'), requireSinRestriccionDeSucursal,
  asyncHandler(adminController.eliminarTurno)
);

// Usuarios adicionales de la empresa (solo el admin principal)
router.get('/admin/usuarios', requireAdminAuth, requirePrincipal, asyncHandler(adminController.paginaUsuarios));
router.get('/api/admin/usuarios', requireAdminAuth, requirePrincipal, asyncHandler(adminController.listarUsuarios));
router.post('/api/admin/usuarios', requireAdminAuth, requirePrincipal, asyncHandler(adminController.crearUsuario));
router.patch('/api/admin/usuarios/:id', requireAdminAuth, requirePrincipal, asyncHandler(adminController.actualizarUsuario));
router.post(
  '/api/admin/usuarios/:id/restablecer-password',
  requireAdminAuth,
  requirePrincipal,
  asyncHandler(adminController.restablecerPasswordUsuario)
);
router.delete('/api/admin/usuarios/:id', requireAdminAuth, requirePrincipal, asyncHandler(adminController.eliminarUsuario));

// Publico: se muestra en el header tanto del panel admin como del check-in
router.get('/logo/:empresaId', asyncHandler(adminController.servirLogo));

module.exports = router;
