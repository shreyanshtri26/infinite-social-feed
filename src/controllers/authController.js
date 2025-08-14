const User = require('../models/User');
const { HTTP_STATUS, ERROR_MESSAGES } = require('../utils/constants');
const logger = require('../utils/logger');

/**
 * Authentication Controller
 * Handles user registration, login, and authentication-related operations
 */
class AuthController {
  /**
   * Register a new user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async register(req, res) {
    try {
      const { username, email, password, firstName, lastName } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ email }, { username }]
      });

      if (existingUser) {
        const field = existingUser.email === email ? 'email' : 'username';
        return res.status(HTTP_STATUS.CONFLICT).json({
          error: 'User Exists',
          message: `User with this ${field} already exists`
        });
      }

      // Create new user
      const user = new User({
        username: username.toLowerCase(),
        email: email.toLowerCase(),
        password,
        firstName,
        lastName
      });

      await user.save();

      // Generate JWT token
      const token = user.generateToken();

      // Remove password from response
      const userResponse = user.toJSON();

      logger.info(`New user registered: ${username} (${email})`);

      res.status(HTTP_STATUS.CREATED).json({
        message: 'User registered successfully',
        user: userResponse,
        token
      });

    } catch (error) {
      logger.error('Registration error:', error);
      
      // Handle validation errors
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(e => ({
          field: e.path,
          message: e.message
        }));
        
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Validation Error',
          message: 'Please check your input data',
          details: errors
        });
      }

      // Handle duplicate key errors
      if (error.code === 11000) {
        const field = Object.keys(error.keyValue)[0];
        return res.status(HTTP_STATUS.CONFLICT).json({
          error: 'Duplicate Error',
          message: `${field} already exists`
        });
      }

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Registration failed',
        message: 'An error occurred during registration'
      });
    }
  }

  /**
   * Login user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async login(req, res) {
    try {
      const { email, password } = req.body;

      // Find user by email and include password for comparison
      const user = await User.findOne({ 
        email: email.toLowerCase() 
      }).select('+password');

      if (!user) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          error: ERROR_MESSAGES.INVALID_CREDENTIALS,
          message: 'Please check your email and password'
        });
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      
      if (!isPasswordValid) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          error: ERROR_MESSAGES.INVALID_CREDENTIALS,
          message: 'Please check your email and password'
        });
      }

      // Update last active timestamp
      user.lastActiveAt = new Date();
      await user.save();

      // Generate JWT token
      const token = user.generateToken();

      // Remove password from response
      const userResponse = user.toJSON();

      logger.info(`User logged in: ${user.username} (${user.email})`);

      res.json({
        message: 'Login successful',
        user: userResponse,
        token
      });

    } catch (error) {
      logger.error('Login error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Login failed',
        message: 'An error occurred during login'
      });
    }
  }

  /**
   * Get current user profile
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getCurrentUser(req, res) {
    try {
      // User is attached to req by auth middleware
      const user = req.user;

      res.json({
        message: 'User profile retrieved successfully',
        user: user.toJSON()
      });

    } catch (error) {
      logger.error('Get current user error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to get user profile',
        message: 'An error occurred while fetching user profile'
      });
    }
  }

  /**
   * Refresh JWT token
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async refreshToken(req, res) {
    try {
      // User is attached to req by auth middleware
      const user = req.user;

      // Generate new token
      const token = user.generateToken();

      res.json({
        message: 'Token refreshed successfully',
        token
      });

    } catch (error) {
      logger.error('Token refresh error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Token refresh failed',
        message: 'An error occurred while refreshing token'
      });
    }
  }

  /**
   * Logout user (client-side token removal)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async logout(req, res) {
    try {
      // In a JWT-based system, logout is typically handled client-side
      // by removing the token. This endpoint acknowledges the logout.
      
      logger.info(`User logged out: ${req.user?.username}`);

      res.json({
        message: 'Logout successful'
      });

    } catch (error) {
      logger.error('Logout error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Logout failed',
        message: 'An error occurred during logout'
      });
    }
  }

  /**
   * Check if username is available
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async checkUsernameAvailability(req, res) {
    try {
      const { username } = req.params;

      if (!username || username.length < 3) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Invalid Username',
          message: 'Username must be at least 3 characters long'
        });
      }

      const existingUser = await User.findOne({ 
        username: username.toLowerCase() 
      });

      res.json({
        available: !existingUser,
        username: username.toLowerCase()
      });

    } catch (error) {
      logger.error('Username check error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Username check failed',
        message: 'An error occurred while checking username availability'
      });
    }
  }

  /**
   * Check if email is available
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async checkEmailAvailability(req, res) {
    try {
      const { email } = req.params;

      if (!email || !email.includes('@')) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Invalid Email',
          message: 'Please provide a valid email address'
        });
      }

      const existingUser = await User.findOne({ 
        email: email.toLowerCase() 
      });

      res.json({
        available: !existingUser,
        email: email.toLowerCase()
      });

    } catch (error) {
      logger.error('Email check error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Email check failed',
        message: 'An error occurred while checking email availability'
      });
    }
  }

  /**
   * Validate current session/token
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async validateSession(req, res) {
    try {
      // If we reach here, the auth middleware has already validated the token
      const user = req.user;

      res.json({
        valid: true,
        user: user.toJSON(),
        message: 'Session is valid'
      });

    } catch (error) {
      logger.error('Session validation error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Session validation failed',
        message: 'An error occurred while validating session'
      });
    }
  }
}

module.exports = AuthController;