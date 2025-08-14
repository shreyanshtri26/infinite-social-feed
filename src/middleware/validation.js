const Joi = require('joi');
const { HTTP_STATUS } = require('../utils/constants');

// Generic validation middleware
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error } = schema.validate(req[property], {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context.value
      }));

      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Validation Error',
        message: 'Please check your input data',
        details: errors
      });
    }

    next();
  };
};

// Validation schemas
const schemas = {
  // User registration
  register: Joi.object({
    username: Joi.string()
      .alphanum()
      .min(3)
      .max(30)
      .pattern(/^[a-zA-Z0-9_]+$/)
      .required()
      .messages({
        'string.pattern.base': 'Username can only contain letters, numbers, and underscores'
      }),
    email: Joi.string()
      .email()
      .required()
      .messages({
        'string.email': 'Please provide a valid email address'
      }),
    password: Joi.string()
      .min(6)
      .max(128)
      .required()
      .messages({
        'string.min': 'Password must be at least 6 characters long'
      }),
    firstName: Joi.string()
      .trim()
      .min(1)
      .max(50)
      .required(),
    lastName: Joi.string()
      .trim()
      .min(1)
      .max(50)
      .required()
  }),

  // User login
  login: Joi.object({
    email: Joi.string()
      .email()
      .required(),
    password: Joi.string()
      .required()
  }),

  // Create post
  createPost: Joi.object({
    content: Joi.string()
      .trim()
      .min(1)
      .max(2200)
      .required()
      .messages({
        'string.max': 'Post content cannot exceed 2200 characters'
      }),
    tags: Joi.array()
      .items(
        Joi.string()
          .trim()
          .min(1)
          .max(50)
          .pattern(/^[a-zA-Z0-9_]+$/)
          .messages({
            'string.pattern.base': 'Tags can only contain letters, numbers, and underscores'
          })
      )
      .max(30)
      .default([])
      .messages({
        'array.max': 'Cannot have more than 30 tags per post'
      }),
    imageUrl: Joi.string()
      .uri()
      .allow('')
      .optional()
  }),

  // Update post
  updatePost: Joi.object({
    content: Joi.string()
      .trim()
      .min(1)
      .max(2200)
      .optional(),
    tags: Joi.array()
      .items(
        Joi.string()
          .trim()
          .min(1)
          .max(50)
          .pattern(/^[a-zA-Z0-9_]+$/)
      )
      .max(30)
      .optional(),
    imageUrl: Joi.string()
      .uri()
      .allow('')
      .optional()
  }),

  // Update user profile
  updateProfile: Joi.object({
    firstName: Joi.string()
      .trim()
      .min(1)
      .max(50)
      .optional(),
    lastName: Joi.string()
      .trim()
      .min(1)
      .max(50)
      .optional(),
    bio: Joi.string()
      .trim()
      .max(150)
      .allow('')
      .optional(),
    profilePicture: Joi.string()
      .uri()
      .allow('')
      .optional()
  }),

  // Feed query parameters
  feedQuery: Joi.object({
    page: Joi.number()
      .integer()
      .min(1)
      .default(1),
    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(20),
    tags: Joi.string()
      .optional()
      .custom((value, helpers) => {
        if (value) {
          const tags = value.split(',').map(tag => tag.trim()).filter(tag => tag);
          if (tags.length > 10) {
            return helpers.error('custom.tooManyTags');
          }
          return tags;
        }
        return [];
      })
      .messages({
        'custom.tooManyTags': 'Cannot filter by more than 10 tags'
      }),
    sortBy: Joi.string()
      .valid('recent', 'popular', 'trending')
      .default('recent')
  }),

  // Pagination query
  pagination: Joi.object({
    page: Joi.number()
      .integer()
      .min(1)
      .default(1),
    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(20)
  }),

  // MongoDB ObjectId
  objectId: Joi.object({
    id: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        'string.pattern.base': 'Invalid ID format'
      })
  }),

  // Search query
  search: Joi.object({
    q: Joi.string()
      .trim()
      .min(1)
      .max(100)
      .required()
      .messages({
        'string.min': 'Search query cannot be empty'
      }),
    type: Joi.string()
      .valid('posts', 'users', 'tags')
      .default('posts'),
    page: Joi.number()
      .integer()
      .min(1)
      .default(1),
    limit: Joi.number()
      .integer()
      .min(1)
      .max(50)
      .default(20)
  })
};

// Validation middleware functions
const validateRegister = validate(schemas.register);
const validateLogin = validate(schemas.login);
const validateCreatePost = validate(schemas.createPost);
const validateUpdatePost = validate(schemas.updatePost);
const validateUpdateProfile = validate(schemas.updateProfile);
const validateFeedQuery = validate(schemas.feedQuery, 'query');
const validatePagination = validate(schemas.pagination, 'query');
const validateObjectId = validate(schemas.objectId, 'params');
const validateSearch = validate(schemas.search, 'query');

// Custom validation for file uploads
const validateImageUpload = (req, res, next) => {
  if (!req.file) {
    return next();
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const maxSize = 5 * 1024 * 1024; // 5MB

  if (!allowedTypes.includes(req.file.mimetype)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Invalid file type',
      message: 'Only JPEG, PNG, and WebP images are allowed'
    });
  }

  if (req.file.size > maxSize) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'File too large',
      message: 'Image size cannot exceed 5MB'
    });
  }

  next();
};

module.exports = {
  validate,
  schemas,
  validateRegister,
  validateLogin,
  validateCreatePost,
  validateUpdatePost,
  validateUpdateProfile,
  validateFeedQuery,
  validatePagination,
  validateObjectId,
  validateSearch,
  validateImageUpload
};