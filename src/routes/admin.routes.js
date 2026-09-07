const express = require('express');
const multer = require('multer');
const adminController = require('../controllers/admin.controller');
const requireAdminAuth = require('../middleware/requireAdminAuth');
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
  requireAdminAuth,
  asyncHandler(adminController.paginaTrabajadores)
);
router.get(
  '/admin/trabajadores/:id/horario',
  requireAdminAuth,
  asyncHandler(adminController.paginaHorarioTrabajador)
);
router.get('/admin/turnos', requireAdminAuth, asyncHandler(adminController.paginaTurnos));
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
  requireAdminAuth,
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
  '/api/admin/attendance/export.csv',
  requireAdminAuth,
  asyncHandler(adminController.exportarCsv)
);
router.get('/api/admin/workers', requireAdminAuth, asyncHandler(adminController.listarWorkers));
router.patch(
  '/api/admin/workers/:id',
  requireAdminAuth,
  asyncHandler(adminController.actualizarWorker)
);
router.patch(
  '/api/admin/attendance/:id',
  requireAdminAuth,
  asyncHandler(adminController.editarAsistencia)
);
router.post(
  '/api/admin/attendance/:id/horas-extra',
  requireAdminAuth,
  asyncHandler(adminController.cambiarEstadoHorasExtra)
);
router.post(
  '/api/admin/empresa/logo',
  requireAdminAuth,
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
  requireAdminAuth,
  asyncHandler(adminController.guardarConfiguracionEmpresa)
);

// Horario del trabajador (semanal o rotativo)
router.get(
  '/api/admin/workers/:id/horario',
  requireAdminAuth,
  asyncHandler(adminController.obtenerHorarioTrabajador)
);
router.put(
  '/api/admin/workers/:id/horario',
  requireAdminAuth,
  asyncHandler(adminController.guardarHorarioTrabajador)
);

// Excepciones puntuales de horario
router.get(
  '/api/admin/workers/:id/excepciones',
  requireAdminAuth,
  asyncHandler(adminController.listarExcepcionesTrabajador)
);
router.post(
  '/api/admin/workers/:id/excepciones',
  requireAdminAuth,
  asyncHandler(adminController.crearExcepcionTrabajador)
);
router.delete(
  '/api/admin/workers/:id/excepciones/:excepcionId',
  requireAdminAuth,
  asyncHandler(adminController.eliminarExcepcionTrabajador)
);

// Plantillas de turno (Nivel 2)
router.get('/api/admin/turnos', requireAdminAuth, asyncHandler(adminController.listarTurnos));
router.post('/api/admin/turnos', requireAdminAuth, asyncHandler(adminController.crearTurno));
router.patch(
  '/api/admin/turnos/:id',
  requireAdminAuth,
  asyncHandler(adminController.actualizarTurno)
);
router.delete(
  '/api/admin/turnos/:id',
  requireAdminAuth,
  asyncHandler(adminController.eliminarTurno)
);

// Publico: se muestra en el header tanto del panel admin como del check-in
router.get('/logo/:empresaId', asyncHandler(adminController.servirLogo));

module.exports = router;
