const User = require('../models/User');
const Post = require('../models/Post');
const Like = require('../models/Like');
const PersonalizationService = require('../services/personalizationService');
const { HTTP_STATUS, DEFAULT_PAGE_SIZE } = require('../utils/constants');
const logger = require('../utils/logger');

/**
 * User Controller
 * Handles user-related operations
 */
class UserController {
  /**
   * Get user profile by username
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getUserProfile(req, res) {
    try {
      const { username } = req.params;

      const user = await User.findOne({ username })
        .select('-password -email -likedTags');

      if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          error: 'User not found',
          message: 'The requested user does not exist'
        });
      }

      res.json({
        message: 'User profile retrieved successfully',
        user
      });

    } catch (error) {
      logger.error('Get user profile error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to get user profile',
        message: 'An error occurred while fetching user profile'
      });
    }
  }

  /**
   * Update current user's profile
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async updateProfile(req, res) {
    try {
      const userId = req.user._id;
      const { firstName, lastName, bio, profilePicture } = req.body;

      const updateData = {};
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (bio !== undefined) updateData.bio = bio;
      if (profilePicture !== undefined) updateData.profilePicture = profilePicture;

      const user = await User.findByIdAndUpdate(
        userId,
        updateData,
        { new: true, runValidators: true }
      ).select('-password');

      if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          error: 'User not found',
          message: 'User account not found'
        });
      }

      logger.info(`User profile updated: ${user.username}`);

      res.json({
        message: 'Profile updated successfully',
        user
      });

    } catch (error) {
      logger.error('Update profile error:', error);
      
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(e => ({
          field: e.path,
          message: e.message
        }));
        
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Validation Error',
          message: 'Please check your profile data',
          details: errors
        });
      }

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Profile update failed',
        message: 'An error occurred while updating your profile'
      });
    }
  }

  /**
   * Get user's posts
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getUserPosts(req, res) {
    try {
      const { username } = req.params;
      const { page = 1, limit = DEFAULT_PAGE_SIZE } = req.query;

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
      const skip = (pageNum - 1) * limitNum;

      // Find user
      const user = await User.findOne({ username });
      if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          error: 'User not found',
          message: 'The requested user does not exist'
        });
      }

      // Get user's posts
      const [posts, totalCount] = await Promise.all([
        Post.find({
          author: user._id,
          isActive: true
        })
          .populate('author', 'username firstName lastName profilePicture isVerified')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        
        Post.countDocuments({
          author: user._id,
          isActive: true
        })
      ]);

      // Add like information if user is authenticated
      let postsWithLikes = posts;
      if (req.user) {
        const postIds = posts.map(post => post._id);
        const likeStatuses = await Like.checkUserLikes(req.user._id, postIds);
        
        postsWithLikes = posts.map(post => ({
          ...post,
          isLiked: likeStatuses.find(ls => ls.postId === post._id.toString())?.isLiked || false
        }));
      }

      res.json({
        message: 'User posts retrieved successfully',
        user: {
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          profilePicture: user.profilePicture,
          isVerified: user.isVerified,
          postsCount: user.postsCount
        },
        posts: postsWithLikes,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalCount / limitNum),
          totalPosts: totalCount,
          hasNextPage: pageNum < Math.ceil(totalCount / limitNum),
          hasPrevPage: pageNum > 1
        }
      });

    } catch (error) {
      logger.error('Get user posts error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to get user posts',
        message: 'An error occurred while fetching user posts'
      });
    }
  }

  /**
   * Get current user's liked posts
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getLikedPosts(req, res) {
    try {
      const userId = req.user._id;
      const { page = 1, limit = DEFAULT_PAGE_SIZE } = req.query;

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
      const skip = (pageNum - 1) * limitNum;

      const likedPosts = await Like.getUserLikedPosts(userId, {
        skip,
        limit: limitNum
      });

      const totalLikes = await Like.countDocuments({
        user: userId,
        isActive: true
      });

      res.json({
        message: 'Liked posts retrieved successfully',
        posts: likedPosts.map(like => ({
          ...like.post.toJSON(),
          likedAt: like.createdAt,
          isLiked: true
        })),
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalLikes / limitNum),
          totalLikes,
          hasNextPage: pageNum < Math.ceil(totalLikes / limitNum),
          hasPrevPage: pageNum > 1
        }
      });

    } catch (error) {
      logger.error('Get liked posts error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to get liked posts',
        message: 'An error occurred while fetching your liked posts'
      });
    }
  }

  /**
   * Get user's preferred tags
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getPreferredTags(req, res) {
    try {
      const userId = req.user._id;
      const { limit = 20 } = req.query;

      const preferredTags = await PersonalizationService.getUserPreferredTags(
        userId, 
        { limit: Math.min(50, Math.max(1, parseInt(limit))) }
      );

      res.json({
        message: 'Preferred tags retrieved successfully',
        tags: preferredTags
      });

    } catch (error) {
      logger.error('Get preferred tags error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to get preferred tags',
        message: 'An error occurred while fetching your preferred tags'
      });
    }
  }

  /**
   * Get similar users based on preferences
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getSimilarUsers(req, res) {
    try {
      const userId = req.user._id;
      const { limit = 10 } = req.query;

      const similarUsers = await PersonalizationService.getSimilarUsers(
        userId,
        {
          limit: Math.min(20, Math.max(1, parseInt(limit))),
          minSimilarity: 0.2
        }
      );

      res.json({
        message: 'Similar users retrieved successfully',
        users: similarUsers
      });

    } catch (error) {
      logger.error('Get similar users error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to get similar users',
        message: 'An error occurred while finding similar users'
      });
    }
  }

  /**
   * Search users
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async searchUsers(req, res) {
    try {
      const { q: query, page = 1, limit = 20 } = req.query;

      if (!query || query.trim().length === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Search query required',
          message: 'Please provide a search query'
        });
      }

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
      const skip = (pageNum - 1) * limitNum;

      const searchRegex = new RegExp(query.trim(), 'i');

      const [users, totalCount] = await Promise.all([
        User.find({
          $or: [
            { username: searchRegex },
            { firstName: searchRegex },
            { lastName: searchRegex }
          ]
        })
          .select('username firstName lastName profilePicture isVerified postsCount followersCount')
          .sort({ followersCount: -1, postsCount: -1 })
          .skip(skip)
          .limit(limitNum),
        
        User.countDocuments({
          $or: [
            { username: searchRegex },
            { firstName: searchRegex },
            { lastName: searchRegex }
          ]
        })
      ]);

      res.json({
        message: 'User search completed successfully',
        query: query.trim(),
        users,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalCount / limitNum),
          totalResults: totalCount,
          hasNextPage: pageNum < Math.ceil(totalCount / limitNum),
          hasPrevPage: pageNum > 1
        }
      });

    } catch (error) {
      logger.error('Search users error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'User search failed',
        message: 'An error occurred while searching users'
      });
    }
  }

  /**
   * Get user statistics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getUserStats(req, res) {
    try {
      const userId = req.user._id;

      const [
        totalPosts,
        totalLikes,
        totalLikesReceived
      ] = await Promise.all([
        Post.countDocuments({ author: userId, isActive: true }),
        Like.countDocuments({ user: userId, isActive: true }),
        Like.countDocuments({
          post: { $in: await Post.find({ author: userId }).distinct('_id') },
          isActive: true
        })
      ]);

      res.json({
        message: 'User statistics retrieved successfully',
        stats: {
          totalPosts,
          totalLikes,
          totalLikesReceived,
          joinedAt: req.user.createdAt,
          lastActiveAt: req.user.lastActiveAt
        }
      });

    } catch (error) {
      logger.error('Get user stats error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to get user statistics',
        message: 'An error occurred while fetching user statistics'
      });
    }
  }
}

module.exports = UserController;