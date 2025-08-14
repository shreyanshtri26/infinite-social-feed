const rateLimit = require('express-rate-limit');
const { HTTP_STATUS } = require('../utils/constants');
const logger = require('../utils/logger');

// Create rate limit error handler
const rateLimitHandler = (req, res) => {
  logger.warn(`Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
  
  res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: Math.round(req.rateLimit.resetTime / 1000)
  });
};

// General API rate limiting
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 100 requests per window
  message: {
    error: 'Too Many Requests',
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  }
});

// Stricter rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    error: 'Too Many Login Attempts',
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skipSuccessfulRequests: true
});

// Rate limiting for post creation
const createPostLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 posts per hour
  message: {
    error: 'Post Creation Limit',
    message: 'Too many posts created, please wait before posting again.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise fall back to IP
    return req.user ? req.user._id.toString() : req.ip;
  }
});

// Rate limiting for likes
const likeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 likes per minute
  message: {
    error: 'Like Limit',
    message: 'Too many like actions, please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => {
    return req.user ? req.user._id.toString() : req.ip;
  }
});

// Rate limiting for feed requests
const feedLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 feed requests per minute
  message: {
    error: 'Feed Request Limit',
    message: 'Too many feed requests, please wait a moment.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => {
    return req.user ? req.user._id.toString() : req.ip;
  }
});

// Rate limiting for search
const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15, // 15 searches per minute
  message: {
    error: 'Search Limit',
    message: 'Too many search requests, please wait a moment.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler
});

// Rate limiting for file uploads
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 uploads per hour
  message: {
    error: 'Upload Limit',
    message: 'Too many file uploads, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => {
    return req.user ? req.user._id.toString() : req.ip;
  }
});

module.exports = {
  generalLimiter,
  authLimiter,
  createPostLimiter,
  likeLimiter,
  feedLimiter,
  searchLimiter,
  uploadLimiter
};