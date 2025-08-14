const express = require('express');
const PostController = require('../controllers/postController');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { 
  createPostLimiter, 
  likeLimiter, 
  searchLimiter 
} = require('../middleware/rateLimiting');
const {
  validateCreatePost,
  validateUpdatePost,
  validateObjectId,
  validatePagination,
  validateSearch
} = require('../middleware/validation');

const router = express.Router();

/**
 * @route POST /api/posts
 * @desc Create a new post
 * @access Private
 */
router.post('/', 
  authenticateToken, 
  createPostLimiter, 
  validateCreatePost, 
  PostController.createPost
);

/**
 * @route GET /api/posts
 * @desc Get posts with pagination and filtering
 * @access Public (optional auth for like status)
 */
router.get('/', 
  optionalAuth, 
  validatePagination, 
  PostController.getPosts
);

/**
 * @route GET /api/posts/my
 * @desc Get current user's posts
 * @access Private
 */
router.get('/my', 
  authenticateToken, 
  validatePagination, 
  PostController.getMyPosts
);

/**
 * @route GET /api/posts/trending-tags
 * @desc Get trending tags
 * @access Public
 */
/**
 * @route GET /api/posts/trending-tags
 * @desc Get trending tags
 * @access Public
 */
router.get('/trending-tags', PostController.getTrendingTags);

/**
 * @route GET /api/posts/search
 * @desc Search posts
 * @access Public (optional auth for like status)
 */
router.get('/search', 
  optionalAuth, 
  searchLimiter, 
  validateSearch, 
  PostController.searchPosts
);

/**
 * @route GET /api/posts/tag/:tag
 * @desc Get posts by tag
 * @access Public (optional auth for like status)
 */
router.get('/tag/:tag', 
  optionalAuth, 
  validatePagination, 
  PostController.getPostsByTag
);

/**
 * @route GET /api/posts/:id
 * @desc Get a specific post by ID
 * @access Public (optional auth for like status)
 */
router.get('/:id', 
  optionalAuth, 
  validateObjectId, 
  PostController.getPostById
);

/**
 * @route PUT /api/posts/:id
 * @desc Update a post
 * @access Private (author only)
 */
router.put('/:id', 
  authenticateToken, 
  validateObjectId, 
  validateUpdatePost, 
  PostController.updatePost
);

/**
 * @route DELETE /api/posts/:id
 * @desc Delete a post
 * @access Private (author only)
 */
router.delete('/:id', 
  authenticateToken, 
  validateObjectId, 
  PostController.deletePost
);

/**
 * @route POST /api/posts/:id/like
 * @desc Like/Unlike a post
 * @access Private
 */
router.post('/:id/like', 
  authenticateToken, 
  likeLimiter, 
  validateObjectId, 
  PostController.toggleLike
);

/**
 * @route GET /api/posts/:id/likes
 * @desc Get post likes
 * @access Public
 */
router.get('/:id/likes', 
  validateObjectId, 
  validatePagination, 
  PostController.getPostLikes
);

module.exports = router;