const express = require('express');
const adminController = require('../controllers/admin.controller');
const requireAdminAuth = require('../middleware/requireAdminAuth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Paginas (EJS)
router.get('/admin/login', adminController.paginaLogin);
router.get('/admin', requireAdminAuth, adminController.paginaDashboard);
router.get('/admin/historial', requireAdminAuth, adminController.paginaHistorial);
router.get('/admin/trabajadores', requireAdminAuth, adminController.paginaTrabajadores);

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

module.exports = router;
