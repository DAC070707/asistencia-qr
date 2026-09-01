const express = require('express');
const checkinController = require('../controllers/checkin.controller');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/checkin/:token', asyncHandler(checkinController.mostrarCheckin));
router.post('/checkin/:token', asyncHandler(checkinController.identificar));
router.post('/checkin/:token/marcar', asyncHandler(checkinController.marcar));
router.get('/mi-historial', asyncHandler(checkinController.historialWorker));

module.exports = router;
