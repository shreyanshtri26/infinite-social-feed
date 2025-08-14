const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { HTTP_STATUS, ERROR_MESSAGES } = require('../utils/constants');
const logger = require('../utils/logger');

// Verify JWT token and attach user to request
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    if (!token) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: ERROR_MESSAGES.UNAUTHORIZED,
        message: 'Access token is required'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: ERROR_MESSAGES.USER_NOT_FOUND,
        message: 'Token is valid but user not found'
      });
    }

    // Attach user to request
    req.user = user;
    req.token = token;
    
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: ERROR_MESSAGES.INVALID_TOKEN,
        message: 'Invalid token format'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: 'Token Expired',
        message: 'Please login again'
      });
    }

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Authentication failed',
      message: 'Internal server error during authentication'
    });
  }
};

// Optional authentication - doesn't fail if no token provided
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    
    req.user = user || null;
    req.token = token;
    
    next();
  } catch (error) {
    // In optional auth, we don't fail on invalid tokens
    req.user = null;
    next();
  }
};

// Check if user owns the resource
const checkOwnership = (resourceKey = 'author') => {
  return (req, res, next) => {
    const resource = req.post || req.comment || req.targetUser;
    
    if (!resource) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        error: 'Resource not found',
        message: 'The requested resource does not exist'
      });
    }
    
    const ownerId = resource[resourceKey] || resource._id;
    const userId = req.user._id;
    
    if (ownerId.toString() !== userId.toString()) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: 'Access Denied',
        message: 'You can only access your own resources'
      });
    }
    
    next();
  };
};

// Admin only middleware
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      error: 'Access Denied',
      message: 'Admin access required'
    });
  }
  next();
};

// Verified users only
const requireVerified = (req, res, next) => {
  if (!req.user || !req.user.isVerified) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      error: 'Access Denied',
      message: 'Verified account required'
    });
  }
  next();
};

module.exports = {
  authenticateToken,
  optionalAuth,
  checkOwnership,
  requireAdmin,
  requireVerified
};