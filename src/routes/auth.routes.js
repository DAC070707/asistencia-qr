const express = require('express');
const authController = require('../controllers/auth.controller');
const requireAdminAuth = require('../middleware/requireAdminAuth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.post('/login', asyncHandler(authController.login));
router.post('/logout', authController.logout);
router.get('/me', requireAdminAuth, authController.me);
router.patch('/password', requireAdminAuth, asyncHandler(authController.cambiarPassword));

module.exports = router;
