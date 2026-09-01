const express = require('express');
const superadminController = require('../controllers/superadmin.controller');
const requireSuperAdminAuth = require('../middleware/requireSuperAdminAuth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Paginas (EJS)
router.get('/superadmin/login', superadminController.paginaLogin);
router.get('/superadmin', requireSuperAdminAuth, superadminController.paginaDashboard);

// API
router.post('/api/superadmin/login', asyncHandler(superadminController.login));
router.post('/api/superadmin/logout', superadminController.logout);
router.get(
  '/api/superadmin/empresas',
  requireSuperAdminAuth,
  asyncHandler(superadminController.listarEmpresas)
);
router.post(
  '/api/superadmin/empresas',
  requireSuperAdminAuth,
  asyncHandler(superadminController.crearEmpresa)
);

module.exports = router;
