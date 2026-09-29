const express = require('express');
const checkinController = require('../controllers/checkin.controller');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/checkin/:token', asyncHandler(checkinController.mostrarCheckin));
router.post('/checkin/:token/identificar', asyncHandler(checkinController.identificar));
// Direccion anterior del formulario de identificacion (paginas ya abiertas).
router.post('/checkin/:token', asyncHandler(checkinController.identificar));
router.post('/checkin/:token/marcar', asyncHandler(checkinController.marcar));
router.get('/checkin/:token/marcar', asyncHandler(checkinController.paginaEscanearNuevamente));
router.get('/checkin/:token/identificar', asyncHandler(checkinController.paginaEscanearNuevamente));
router.post('/checkin/:token/intento-fallido', asyncHandler(checkinController.registrarIntentoFallido));
router.get('/mi-historial', asyncHandler(checkinController.historialWorker));

module.exports = router;
