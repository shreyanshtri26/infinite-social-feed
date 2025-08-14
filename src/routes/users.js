const express = require('express');
const UserController = require('../controllers/userController');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimiting');
const { 
  validateUpdateProfile, 
  validatePagination,
  validateSearch 
} = require('../middleware/validation');

const router = express.Router();

/**
 * @route GET /api/users/search
 * @desc Search users
 * @access Public
 */
router.get('/search', 
  searchLimiter, 
  validateSearch, 
  UserController.searchUsers
);

/**
 * @route PUT /api/users/profile
 * @desc Update current user's profile
 * @access Private
 */
router.put('/profile', 
  authenticateToken, 
  validateUpdateProfile, 
  UserController.updateProfile
);

/**
 * @route GET /api/users/liked-posts
 * @desc Get current user's liked posts
 * @access Private
 */
router.get('/liked-posts', 
  authenticateToken, 
  validatePagination, 
  UserController.getLikedPosts
);

/**
 * @route GET /api/users/preferred-tags
 * @desc Get current user's preferred tags
 * @access Private
 */
router.get('/preferred-tags', 
  authenticateToken, 
  UserController.getPreferredTags
);

/**
 * @route GET /api/users/similar
 * @desc Get users similar to current user
 * @access Private
 */
router.get('/similar', 
  authenticateToken, 
  UserController.getSimilarUsers
);

/**
 * @route GET /api/users/stats
 * @desc Get current user's statistics
 * @access Private
 */
router.get('/stats', 
  authenticateToken, 
  UserController.getUserStats
);

/**
 * @route GET /api/users/:username
 * @desc Get user profile by username
 * @access Public
 */
router.get('/:username', 
  UserController.getUserProfile
);

/**
 * @route GET /api/users/:username/posts
 * @desc Get user's posts by username
 * @access Public (optional auth for like status)
 */
router.get('/:username/posts', 
  optionalAuth, 
  validatePagination, 
  UserController.getUserPosts
);

module.exports = router;