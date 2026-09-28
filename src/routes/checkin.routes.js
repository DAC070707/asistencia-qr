const express = require('express');
const checkinController = require('../controllers/checkin.controller');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/checkin/:token', asyncHandler(checkinController.mostrarCheckin));
router.post('/checkin/:token', asyncHandler(checkinController.identificar));
router.post('/checkin/:token/marcar', asyncHandler(checkinController.marcar));
router.post('/checkin/:token/intento-fallido', asyncHandler(checkinController.registrarIntentoFallido));
router.get('/mi-historial', asyncHandler(checkinController.historialWorker));

module.exports = router;
