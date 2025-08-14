const Post = require('../models/Post');
const Like = require('../models/Like');
const User = require('../models/User');
const PersonalizationService = require('../services/personalizationService');
const { HTTP_STATUS, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require('../utils/constants');
const logger = require('../utils/logger');

/**
 * Post Controller
 * Handles all post-related operations
 */
class PostController {
  /**
   * Create a new post
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async createPost(req, res) {
    try {
      const { content, tags = [], imageUrl = '' } = req.body;
      const userId = req.user._id;

      // Create new post
      const post = new Post({
        author: userId,
        content,
        tags,
        imageUrl
      });

      await post.save();

      // Update user's post count
      await User.findByIdAndUpdate(userId, {
        $inc: { postsCount: 1 }
      });

      // Populate author information
      await post.populate('author', 'username firstName lastName profilePicture');

      logger.info(`New post created by user ${req.user.username}: ${post._id}`);

      res.status(HTTP_STATUS.CREATED).json({
        message: 'Post created successfully',
        post
      });

    } catch (error) {
      logger.error('Create post error:', error);
      
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(e => ({
          field: e.path,
          message: e.message
        }));
        
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Validation Error',
          message: 'Please check your post data',
          details: errors
        });
      }

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Post creation failed',
        message: 'An error occurred while creating the post'
      });
    }
  }

  /**
   * Get trending tags
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getTrendingTags(req, res) {
    try {
      const { limit = 10, timeframe = 24 } = req.query;

      const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
      const timeframeHours = Math.min(168, Math.max(1, parseInt(timeframe))); // Max 1 week

      const trendingTags = await Post.getTrendingTags(limitNum, timeframeHours);

      res.json({
        message: 'Trending tags retrieved successfully',
        tags: trendingTags,
        timeframe: `${timeframeHours} hours`
      });

    } catch (error) {
      logger.error('Get trending tags error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to get trending tags',
        message: 'An error occurred while fetching trending tags'
      });
    }
  }

  /**
   * Search posts
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async searchPosts(req, res) {
    try {
      const { 
        q: query, 
        page = 1, 
        limit = 20,
        sortBy = 'relevance',
        tags
      } = req.query;

      if (!query || query.trim().length === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Search query required',
          message: 'Please provide a search query'
        });
      }

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
      const skip = (pageNum - 1) * limitNum;

      // Build search conditions
      const searchConditions = {
        $text: { $search: query },
        isActive: true
      };

      if (tags) {
        const tagArray = tags.split(',').map(tag => tag.trim().toLowerCase());
        searchConditions.tags = { $in: tagArray };
      }

      // Build sort conditions
      let sortConditions = {};
      switch (sortBy) {
        case 'recent':
          sortConditions = { createdAt: -1 };
          break;
        case 'popular':
          sortConditions = { likesCount: -1, createdAt: -1 };
          break;
        case 'relevance':
        default:
          sortConditions = { score: { $meta: 'textScore' }, createdAt: -1 };
          break;
      }

      // Execute search
      const [posts, totalCount] = await Promise.all([
        Post.find(searchConditions, { score: { $meta: 'textScore' } })
          .populate('author', 'username firstName lastName profilePicture isVerified')
          .sort(sortConditions)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        
        Post.countDocuments(searchConditions)
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
        message: 'Search completed successfully',
        query,
        posts: postsWithLikes,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalCount / limitNum),
          totalResults: totalCount,
          hasNextPage: pageNum < Math.ceil(totalCount / limitNum),
          hasPrevPage: pageNum > 1
        }
      });

    } catch (error) {
      logger.error('Search posts error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Search failed',
        message: 'An error occurred while searching posts'
      });
    }
  }

  /**
   * Get posts by tag
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getPostsByTag(req, res) {
    try {
      const { tag } = req.params;
      const { page = 1, limit = 20, sortBy = 'recent' } = req.query;

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
      const skip = (pageNum - 1) * limitNum;

      // Build sort conditions
      let sortConditions = {};
      switch (sortBy) {
        case 'popular':
          sortConditions = { likesCount: -1, createdAt: -1 };
          break;
        case 'recent':
        default:
          sortConditions = { createdAt: -1 };
          break;
      }

      const [posts, totalCount] = await Promise.all([
        Post.find({
          tags: tag.toLowerCase(),
          isActive: true
        })
          .populate('author', 'username firstName lastName profilePicture isVerified')
          .sort(sortConditions)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        
        Post.countDocuments({
          tags: tag.toLowerCase(),
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
        message: 'Posts retrieved successfully',
        tag: tag.toLowerCase(),
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
      logger.error('Get posts by tag error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to get posts by tag',
        message: 'An error occurred while fetching posts'
      });
    }
  }

  /**
   * Get user's own posts
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getMyPosts(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const userId = req.user._id;

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
      const skip = (pageNum - 1) * limitNum;

      const [posts, totalCount] = await Promise.all([
        Post.find({
          author: userId,
          isActive: true
        })
          .populate('author', 'username firstName lastName profilePicture isVerified')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        
        Post.countDocuments({
          author: userId,
          isActive: true
        })
      ]);

      res.json({
        message: 'Your posts retrieved successfully',
        posts,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalCount / limitNum),
          totalPosts: totalCount,
          hasNextPage: pageNum < Math.ceil(totalCount / limitNum),
          hasPrevPage: pageNum > 1
        }
      });

    } catch (error) {
      logger.error('Get my posts error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to get your posts',
        message: 'An error occurred while fetching your posts'
      });
    }
  }

  /**
   * Get posts with pagination
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getPosts(req, res) {
    try {
      const {
        page = 1,
        limit = DEFAULT_PAGE_SIZE,
        sortBy = 'recent',
        tags,
        author
      } = req.query;

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(limit)));
      const skip = (pageNum - 1) * limitNum;

      // Build query conditions
      const queryConditions = { isActive: true };

      if (tags) {
        const tagArray = tags.split(',').map(tag => tag.trim().toLowerCase());
        queryConditions.tags = { $in: tagArray };
      }

      if (author) {
        const authorUser = await User.findOne({ username: author });
        if (authorUser) {
          queryConditions.author = authorUser._id;
        } else {
          return res.status(HTTP_STATUS.NOT_FOUND).json({
            error: 'Author not found',
            message: 'The specified author does not exist'
          });
        }
      }

      // Build sort conditions
      let sortConditions = {};
      switch (sortBy) {
        case 'popular':
          sortConditions = { likesCount: -1, createdAt: -1 };
          break;
        case 'trending':
          sortConditions = { 
            rankingScore: -1, 
            likesCount: -1, 
            createdAt: -1 
          };
          break;
        case 'recent':
        default:
          sortConditions = { createdAt: -1 };
          break;
      }

      // Execute query
      const [posts, totalCount] = await Promise.all([
        Post.find(queryConditions)
          .populate('author', 'username firstName lastName profilePicture isVerified')
          .sort(sortConditions)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        
        Post.countDocuments(queryConditions)
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
        message: 'Posts retrieved successfully',
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
      logger.error('Get posts error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to get posts',
        message: 'An error occurred while fetching posts'
      });
    }
  }

  /**
   * Get a specific post by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getPostById(req, res) {
    try {
      const { id } = req.params;

      const post = await Post.findOne({
        _id: id,
        isActive: true
      }).populate('author', 'username firstName lastName profilePicture isVerified');

      if (!post) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          error: 'Post not found',
          message: 'The requested post does not exist'
        });
      }

      // Increment view count
      await post.incrementViews();

      // Check if user liked this post
      let isLiked = false;
      if (req.user) {
        isLiked = await Like.isLiked(req.user._id, post._id);
      }

      res.json({
        message: 'Post retrieved successfully',
        post: {
          ...post.toJSON(),
          isLiked
        }
      });

    } catch (error) {
      logger.error('Get post by ID error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to get post',
        message: 'An error occurred while fetching the post'
      });
    }
  }

  /**
   * Update a post
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async updatePost(req, res) {
    try {
      const { id } = req.params;
      const { content, tags, imageUrl } = req.body;
      const userId = req.user._id;

      const post = await Post.findOne({
        _id: id,
        author: userId,
        isActive: true
      });

      if (!post) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          error: 'Post not found',
          message: 'Post not found or you do not have permission to edit it'
        });
      }

      // Update fields if provided
      if (content !== undefined) post.content = content;
      if (tags !== undefined) post.tags = tags;
      if (imageUrl !== undefined) post.imageUrl = imageUrl;

      await post.save();
      await post.populate('author', 'username firstName lastName profilePicture');

      logger.info(`Post updated by user ${req.user.username}: ${post._id}`);

      res.json({
        message: 'Post updated successfully',
        post
      });

    } catch (error) {
      logger.error('Update post error:', error);
      
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(e => ({
          field: e.path,
          message: e.message
        }));
        
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Validation Error',
          message: 'Please check your post data',
          details: errors
        });
      }

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Post update failed',
        message: 'An error occurred while updating the post'
      });
    }
  }

  /**
   * Delete a post
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async deletePost(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user._id;

      const post = await Post.findOne({
        _id: id,
        author: userId,
        isActive: true
      });

      if (!post) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          error: 'Post not found',
          message: 'Post not found or you do not have permission to delete it'
        });
      }

      // Soft delete
      post.isActive = false;
      await post.save();

      // Update user's post count
      await User.findByIdAndUpdate(userId, {
        $inc: { postsCount: -1 }
      });

      // Delete associated likes
      await Like.updateMany(
        { post: id },
        { isActive: false }
      );

      logger.info(`Post deleted by user ${req.user.username}: ${post._id}`);

      res.json({
        message: 'Post deleted successfully'
      });

    } catch (error) {
      logger.error('Delete post error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Post deletion failed',
        message: 'An error occurred while deleting the post'
      });
    }
  }

  /**
   * Like/Unlike a post
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async toggleLike(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user._id;

      const post = await Post.findOne({
        _id: id,
        isActive: true
      });

      if (!post) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          error: 'Post not found',
          message: 'The requested post does not exist'
        });
      }

      // Check if user is trying to like their own post
      if (post.author.toString() === userId.toString()) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Cannot like own post',
          message: 'You cannot like your own post'
        });
      }

      // Check if already liked
      const existingLike = await Like.findOne({
        user: userId,
        post: id,
        isActive: true
      });

      let isLiked;
      let message;

      if (existingLike) {
        // Unlike the post
        existingLike.isActive = false;
        await existingLike.save();
        await post.decrementLikes();
        isLiked = false;
        message = 'Post unliked successfully';
      } else {
        // Check if there's an inactive like to reactivate
        const inactiveLike = await Like.findOne({
          user: userId,
          post: id,
          isActive: false
        });

        if (inactiveLike) {
          inactiveLike.isActive = true;
          await inactiveLike.save();
        } else {
          // Create new like
          await Like.create({
            user: userId,
            post: id
          });
        }

        await post.incrementLikes();
        isLiked = true;
        message = 'Post liked successfully';

        // Update user preferences based on this like
        PersonalizationService.updateUserPreferencesOnLike(userId, id).catch(error => {
          logger.error('Error updating user preferences:', error);
        });
      }

      res.json({
        message,
        isLiked,
        likesCount: post.likesCount
      });

    } catch (error) {
      logger.error('Toggle like error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Like operation failed',
        message: 'An error occurred while processing the like'
      });
    }
  }

  /**
   * Get post likes
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getPostLikes(req, res) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
      const skip = (pageNum - 1) * limitNum;

      const post = await Post.findOne({
        _id: id,
        isActive: true
      });

      if (!post) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          error: 'Post not found',
          message: 'The requested post does not exist'
        });
      }

      const likes = await Like.getPostLikes(id, { skip, limit: limitNum });
      const totalLikes = post.likesCount;

      res.json({
        message: 'Post likes retrieved successfully',
        likes: likes.map(like => ({
          user: like.user,
          likedAt: like.createdAt
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
      logger.error('Get post likes error:', error);
      
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to get post likes',
        message: 'An error occurred while fetching post likes'
      });
    }
  }
}

module.exports = PostController;