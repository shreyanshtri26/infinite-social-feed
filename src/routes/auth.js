const express = require('express');
const AuthController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiting');
const { 
  validateRegister, 
  validateLogin 
} = require('../middleware/validation');

const router = express.Router();

// Apply rate limiting to all auth routes
router.use(authLimiter);

/**
 * @route POST /api/auth/register
 * @desc Register a new user
 * @access Public
 */
router.post('/register', validateRegister, AuthController.register);

/**
 * @route POST /api/auth/login
 * @desc Login user
 * @access Public
 */
router.post('/login', validateLogin, AuthController.login);

/**
 * @route GET /api/auth/me
 * @desc Get current user profile
 * @access Private
 */
router.get('/me', authenticateToken, AuthController.getCurrentUser);

/**
 * @route POST /api/auth/refresh
 * @desc Refresh JWT token
 * @access Private
 */
router.post('/refresh', authenticateToken, AuthController.refreshToken);

/**
 * @route POST /api/auth/logout
 * @desc Logout user
 * @access Private
 */
router.post('/logout', authenticateToken, AuthController.logout);

/**
 * @route GET /api/auth/check-username/:username
 * @desc Check if username is available
 * @access Public
 */
router.get('/check-username/:username', AuthController.checkUsernameAvailability);

/**
 * @route GET /api/auth/check-email/:email
 * @desc Check if email is available
 * @access Public
 */
router.get('/check-email/:email', AuthController.checkEmailAvailability);

/**
 * @route GET /api/auth/validate
 * @desc Validate current session/token
 * @access Private
 */
router.get('/validate', authenticateToken, AuthController.validateSession);

module.exports = router;