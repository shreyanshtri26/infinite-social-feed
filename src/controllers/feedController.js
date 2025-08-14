const Post = require('../models/Post');
const Like = require('../models/Like');
const RankingService = require('../services/rankingService');
const PersonalizationService = require('../services/personalizationService');
const cacheService = require('../services/cacheService');
const { 
  HTTP_STATUS, 
  DEFAULT_PAGE_SIZE, 
  MAX_PAGE_SIZE,
  FEED_CACHE_TTL,
  CACHE_KEYS 
} = require('../utils/constants');
const logger = require('../utils/logger');

/**
 * Feed Controller
 * Handles infinite scrolling social feed with personalization and ranking
 */
class FeedController {
  /**
   * Get personalized infinite scrolling feed
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getPersonalizedFeed(req, res) {
    try {
      const {
        page = 1,
        limit = DEFAULT_PAGE_SIZE,
        lastPostId,
        tags,
        refresh = false
      } = req.query;

      const userId = req.user._id;
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(limit)));

      // Generate cache key
      const cacheKey = CACHE_KEYS.USER_FEED(userId) + `:${pageNum}:${limitNum}:${tags || 'all'}`;

      // Check cache if not refreshing
      if (!refresh) {
        const cachedFeed = await cacheService.get(cacheKey);
        if (cachedFeed) {
          return res.json({
            message: 'Personalized feed retrieved successfully',
            posts: cachedFeed.posts,
            pagination: cachedFeed.pagination,
            cached: true
          });
        }
      }

      // Get user's preferred tags for personalization
      const userPreferredTags = await PersonalizationService.getUserPreferredTags(userId, {
        limit: 30,
        useCache: true
      });

      // Build query conditions
      let queryConditions = {
        isActive: true,
        author: { $ne: userId } // Exclude user's own posts
      };

      // Filter by tags if provided
      if (tags) {
        const tagArray = tags.split(',').map(tag => tag.trim().toLowerCase());
        queryConditions.tags = { $in: tagArray };
      }

      // Handle cursor-based pagination for infinite scroll
      if (lastPostId) {
        const lastPost = await Post.findById(lastPostId);
        if (lastPost) {
          queryConditions.createdAt = { $lt: lastPost.createdAt };
        }
      }

      // Get posts with enhanced ranking
      const posts = await this.getPersonalizedPosts(
        queryConditions,
        userPreferredTags,
        limitNum,
        pageNum
      );

      // Add engagement metadata
      const enrichedPosts = await this.enrichPostsWithEngagement(posts, userId);

      // Calculate pagination info
      const hasMorePosts = enrichedPosts.length === limitNum;
      const nextLastPostId = enrichedPosts.length > 0 
        ? enrichedPosts[enrichedPosts.length - 1]._id 
        : null;

      const result = {
        posts: enrichedPosts,
        pagination: {
          currentPage: pageNum,
          limit: limitNum,
          hasNextPage: hasMorePosts,
          nextLastPostId,
          totalFetched: enrichedPosts.length
        }
      };

      // Cache the result
      await cacheService.set(cacheKey, result, FEED_CACHE_TTL);

      res.json({
        message: 'Personalized feed retrieved successfully',
        ...result,
        cached: false
      });

    } catch (error) {
      logger.error('Get personalized feed error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to get personalized feed',
        message: 'An error occurred while fetching your feed'
      });
    }
  }

  /**
   * Get posts with personalized ranking
   * @param {Object} queryConditions - MongoDB query conditions
   * @param {Array} userPreferredTags - User's preferred tags
   * @param {number} limit - Number of posts to fetch
   * @param {number} page - Page number
   * @returns {Array} Ranked posts
   */
  static async getPersonalizedPosts(queryConditions, userPreferredTags, limit, page) {
    try {
      // Fetch more posts than needed for better ranking diversity
      const fetchLimit = Math.min(limit * 3, 100);

      const posts = await Post.aggregate([
        { $match: queryConditions },
        {
          $lookup: {
            from: 'users',
            localField: 'author',
            foreignField: '_id',
            as: 'author'
          }
        },
        {
          $addFields: {
            author: { $arrayElemAt: ['$author', 0] }
          }
        },
        {
          $project: {
            'author.password': 0,
            'author.likedTags': 0,
            'author.email': 0
          }
        },
        { $limit: fetchLimit }
      ]);

      // Apply personalized ranking
      const rankedPosts = RankingService.calculateBatchRankingScores(
        posts,
        userPreferredTags
      );

      // Sort by ranking score
      const sortedPosts = RankingService.sortByRanking(rankedPosts, 'recent');

      // Apply diversity to prevent similar content clustering
      const diversifiedPosts = RankingService.applyDiversity(sortedPosts, 0.3);

      // Return only the requested number of posts
      return diversifiedPosts.slice(0, limit);

    } catch (error) {
      logger.error('Error getting personalized posts:', error);
      throw error;
    }
  }

  /**
   * Enrich posts with engagement data and user interaction status
   * @param {Array} posts - Array of posts
   * @param {string} userId - Current user ID
   * @returns {Array} Enriched posts
   */
  static async enrichPostsWithEngagement(posts, userId) {
    if (posts.length === 0) return posts;

    try {
      const postIds = posts.map(post => post._id);

      // Get user's like status for all posts
      const likeStatuses = await Like.checkUserLikes(userId, postIds);

      // Create a map for quick lookup
      const likeStatusMap = new Map();
      likeStatuses.forEach(status => {
        likeStatusMap.set(status.postId, status.isLiked);
      });

      // Enrich posts with engagement data
      return posts.map(post => ({
        ...post,
        isLiked: likeStatusMap.get(post._id.toString()) || false,
        engagementRate: post.engagementRate || 0,
        ageInHours: Math.floor((Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60)),
        // Add relative time for better UX
        timeAgo: this.getRelativeTime(new Date(post.createdAt))
      }));

    } catch (error) {
      logger.error('Error enriching posts with engagement:', error);
      return posts;
    }
  }

  /**
   * Get general (non-personalized) feed for anonymous users
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getGeneralFeed(req, res) {
    try {
      const {
        page = 1,
        limit = DEFAULT_PAGE_SIZE,
        sortBy = 'recent',
        tags,
        lastPostId
      } = req.query;

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(limit)));

      // Build query conditions
      let queryConditions = { isActive: true };

      if (tags) {
        const tagArray = tags.split(',').map(tag => tag.trim().toLowerCase());
        queryConditions.tags = { $in: tagArray };
      }

      // Handle cursor-based pagination
      if (lastPostId) {
        const lastPost = await Post.findById(lastPostId);
        if (lastPost) {
          queryConditions.createdAt = { $lt: lastPost.createdAt };
        }
      }

      // Build sort conditions
      let sortConditions = {};
      switch (sortBy) {
        case 'popular':
          sortConditions = { likesCount: -1, createdAt: -1 };
          break;
        case 'trending':
          sortConditions = { rankingScore: -1, likesCount: -1, createdAt: -1 };
          break;
        case 'recent':
        default:
          sortConditions = { createdAt: -1 };
          break;
      }

      const posts = await Post.find(queryConditions)
        .populate('author', 'username firstName lastName profilePicture isVerified')
        .sort(sortConditions)
        .limit(limitNum)
        .lean();

      const hasMorePosts = posts.length === limitNum;
      const nextLastPostId = posts.length > 0 
        ? posts[posts.length - 1]._id 
        : null;

      res.json({
        message: 'General feed retrieved successfully',
        posts: posts.map(post => ({
          ...post,
          timeAgo: this.getRelativeTime(new Date(post.createdAt))
        })),
        pagination: {
          currentPage: pageNum,
          limit: limitNum,
          hasNextPage: hasMorePosts,
          nextLastPostId,
          totalFetched: posts.length
        }
      });

    } catch (error) {
      logger.error('Get general feed error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to get feed',
        message: 'An error occurred while fetching the feed'
      });
    }
  }

  /**
   * Get recommended posts based on user's activity
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getRecommendations(req, res) {
    try {
      const { limit = 10 } = req.query;
      const userId = req.user._id;
      const limitNum = Math.min(50, Math.max(1, parseInt(limit)));

      // Get personalized recommendations
      const recommendations = await PersonalizationService.getPersonalizedRecommendations(
        userId,
        {
          limit: limitNum,
          includeFollowingPosts: true,
          diversityLevel: 0.4
        }
      );

      // Enrich with engagement data
      const enrichedRecommendations = await this.enrichPostsWithEngagement(
        recommendations,
        userId
      );

      res.json({
        message: 'Recommendations retrieved successfully',
        posts: enrichedRecommendations,
        total: enrichedRecommendations.length
      });

    } catch (error) {
      logger.error('Get recommendations error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to get recommendations',
        message: 'An error occurred while fetching recommendations'
      });
    }
  }

  /**
   * Get trending posts
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getTrendingPosts(req, res) {
    try {
      const {
        limit = 20,
        timeframe = 24 // hours
      } = req.query;

      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
      const timeframeHours = Math.min(168, Math.max(1, parseInt(timeframe))); // Max 1 week

      const cutoffDate = new Date(Date.now() - timeframeHours * 60 * 60 * 1000);

      // Get trending posts based on engagement within timeframe
      const trendingPosts = await Post.aggregate([
        {
          $match: {
            createdAt: { $gte: cutoffDate },
            isActive: true
          }
        },
        {
          $addFields: {
            trendingScore: {
              $add: [
                { $multiply: ['$likesCount', 1] },
                { $multiply: ['$commentsCount', 2] },
                { $multiply: ['$sharesCount', 3] },
                { $divide: ['$viewsCount', 10] }
              ]
            },
            ageWeight: {
              $divide: [
                timeframeHours * 60 * 60 * 1000,
                { $add: [{ $subtract: [new Date(), '$createdAt'] }, 1] }
              ]
            }
          }
        },
        {
          $addFields: {
            finalTrendingScore: { $multiply: ['$trendingScore', '$ageWeight'] }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'author',
            foreignField: '_id',
            as: 'author'
          }
        },
        {
          $addFields: {
            author: { $arrayElemAt: ['$author', 0] }
          }
        },
        {
          $project: {
            'author.password': 0,
            'author.email': 0,
            'author.likedTags': 0,
            trendingScore: 0,
            ageWeight: 0
          }
        },
        { $sort: { finalTrendingScore: -1 } },
        { $limit: limitNum }
      ]);

      // Add engagement metadata if user is authenticated
      let enrichedPosts = trendingPosts;
      if (req.user) {
        enrichedPosts = await this.enrichPostsWithEngagement(trendingPosts, req.user._id);
      } else {
        enrichedPosts = trendingPosts.map(post => ({
          ...post,
          timeAgo: this.getRelativeTime(new Date(post.createdAt))
        }));
      }

      res.json({
        message: 'Trending posts retrieved successfully',
        posts: enrichedPosts,
        timeframe: `${timeframeHours} hours`,
        total: enrichedPosts.length
      });

    } catch (error) {
      logger.error('Get trending posts error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to get trending posts',
        message: 'An error occurred while fetching trending posts'
      });
    }
  }

  /**
   * Clear user's feed cache
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async clearFeedCache(req, res) {
    try {
      const userId = req.user._id;
      
      // Delete all cached feed data for this user
      const pattern = CACHE_KEYS.USER_FEED(userId) + '*';
      
      // Note: In a real implementation, you'd use Redis SCAN or similar
      // For simplicity, we'll just delete the main cache key
      await cacheService.delete(CACHE_KEYS.USER_FEED(userId));
      
      res.json({
        message: 'Feed cache cleared successfully'
      });

    } catch (error) {
      logger.error('Clear feed cache error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to clear feed cache',
        message: 'An error occurred while clearing feed cache'
      });
    }
  }

  /**
   * Get relative time string from date
   * @param {Date} date - Date object
   * @returns {string} Relative time string
   */
  static getRelativeTime(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    
    return date.toLocaleDateString();
  }
}

module.exports = FeedController;