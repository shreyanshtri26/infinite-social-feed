const express = require('express');
const FeedController = require('../controllers/feedController');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { feedLimiter } = require('../middleware/rateLimiting');
const { validateFeedQuery } = require('../middleware/validation');

const router = express.Router();

// Apply rate limiting to feed routes
router.use(feedLimiter);

/**
 * @route GET /api/feed
 * @desc Get personalized infinite scrolling feed (authenticated) or general feed (anonymous)
 * @access Public/Private
 */
router.get('/', optionalAuth, validateFeedQuery, (req, res) => {
  if (req.user) {
    return FeedController.getPersonalizedFeed(req, res);
  } else {
    return FeedController.getGeneralFeed(req, res);
  }
});

/**
 * @route GET /api/feed/personalized
 * @desc Get personalized feed for authenticated users
 * @access Private
 */
router.get('/personalized', 
  authenticateToken, 
  validateFeedQuery, 
  FeedController.getPersonalizedFeed
);

/**
 * @route GET /api/feed/general
 * @desc Get general feed (no personalization)
 * @access Public
 */
router.get('/general', 
  optionalAuth, 
  validateFeedQuery, 
  FeedController.getGeneralFeed
);

/**
 * @route GET /api/feed/recommendations
 * @desc Get personalized post recommendations
 * @access Private
 */
router.get('/recommendations', 
  authenticateToken, 
  FeedController.getRecommendations
);

/**
 * @route GET /api/feed/trending
 * @desc Get trending posts
 * @access Public
 */
router.get('/trending', 
  optionalAuth, 
  FeedController.getTrendingPosts
);

/**
 * @route DELETE /api/feed/cache
 * @desc Clear user's feed cache
 * @access Private
 */
router.delete('/cache', 
  authenticateToken, 
  FeedController.clearFeedCache
);

module.exports = router;