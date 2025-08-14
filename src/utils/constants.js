module.exports = {
    // Pagination
    DEFAULT_PAGE_SIZE: parseInt(process.env.DEFAULT_PAGE_SIZE) || 20,
    MAX_PAGE_SIZE: parseInt(process.env.MAX_PAGE_SIZE) || 100,
    
    // Feed Configuration
    FEED_CACHE_TTL: parseInt(process.env.FEED_CACHE_TTL) || 300, // 5 minutes
    
    // Ranking Weights
    PERSONALIZATION_WEIGHT: parseFloat(process.env.PERSONALIZATION_WEIGHT) || 0.4,
    RECENCY_WEIGHT: parseFloat(process.env.RECENCY_WEIGHT) || 0.3,
    POPULARITY_WEIGHT: parseFloat(process.env.POPULARITY_WEIGHT) || 0.3,
    
    // Time constants
    HOUR_IN_MS: 60 * 60 * 1000,
    DAY_IN_MS: 24 * 60 * 60 * 1000,
    WEEK_IN_MS: 7 * 24 * 60 * 60 * 1000,
    
    // Post constraints
    MAX_POST_CONTENT_LENGTH: 2200,
    MAX_TAGS_PER_POST: 30,
    MAX_TAG_LENGTH: 50,
    
    // User constraints
    MAX_USERNAME_LENGTH: 30,
    MIN_USERNAME_LENGTH: 3,
    MAX_BIO_LENGTH: 150,
    
    // Cache keys
    CACHE_KEYS: {
      USER_FEED: (userId) => `feed:user:${userId}`,
      POST_LIKES: (postId) => `likes:post:${postId}`,
      USER_LIKED_TAGS: (userId) => `tags:user:${userId}`,
      TRENDING_TAGS: 'tags:trending',
      POST_DETAILS: (postId) => `post:${postId}`
    },
    
    // HTTP Status Codes
    HTTP_STATUS: {
      OK: 200,
      CREATED: 201,
      NO_CONTENT: 204,
      BAD_REQUEST: 400,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      TOO_MANY_REQUESTS: 429,
      INTERNAL_SERVER_ERROR: 500
    },
    
    // Error Messages
    ERROR_MESSAGES: {
      INVALID_CREDENTIALS: 'Invalid email or password',
      USER_NOT_FOUND: 'User not found',
      POST_NOT_FOUND: 'Post not found',
      UNAUTHORIZED: 'Access denied. No token provided',
      INVALID_TOKEN: 'Invalid token',
      USER_EXISTS: 'User already exists with this email',
      VALIDATION_ERROR: 'Validation failed',
      ALREADY_LIKED: 'Post already liked',
      NOT_LIKED: 'Post not liked yet',
      CANNOT_LIKE_OWN_POST: 'Cannot like your own post'
    }
  };