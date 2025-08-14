const User = require('../models/User');
const Post = require('../models/Post');
const Like = require('../models/Like');
const cacheService = require('./cacheService');
const { CACHE_KEYS } = require('../utils/constants');
const logger = require('../utils/logger');

/**
 * Personalization Service for generating personalized content recommendations
 */
class PersonalizationService {
  /**
   * Get user's personalized tags based on their activity
   * @param {string} userId - User ID
   * @param {Object} options - Options for tag extraction
   * @returns {Array} Array of preferred tags with weights
   */
  static async getUserPreferredTags(userId, options = {}) {
    const { useCache = true, limit = 20, includeRecent = true } = options;

    try {
      // Check cache first
      if (useCache) {
        const cached = await cacheService.get(CACHE_KEYS.USER_LIKED_TAGS(userId));
        if (cached) {
          return cached.slice(0, limit);
        }
      }

      const user = await User.findById(userId);
      if (!user) {
        return [];
      }

      let preferredTags = [...user.likedTags];

      // Include recent activity if requested
      if (includeRecent) {
        const recentLikes = await this.getRecentLikedTags(userId, 30); // Last 30 days
        
        // Merge with user's stored liked tags
        recentLikes.forEach(recentTag => {
          const existingIndex = preferredTags.findIndex(pt => pt.tag === recentTag.tag);
          
          if (existingIndex >= 0) {
            // Boost existing tags with recent activity
            preferredTags[existingIndex].count += recentTag.count * 2; // Recent activity gets double weight
            preferredTags[existingIndex].lastLikedAt = new Date();
          } else {
            // Add new recent tags
            preferredTags.push({
              tag: recentTag.tag,
              count: recentTag.count * 2,
              lastLikedAt: new Date()
            });
          }
        });
      }

      // Sort by count and recency
      preferredTags.sort((a, b) => {
        const scoreA = a.count + (this.getRecencyBoost(a.lastLikedAt));
        const scoreB = b.count + (this.getRecencyBoost(b.lastLikedAt));
        return scoreB - scoreA;
      });

      const result = preferredTags.slice(0, limit);

      // Cache the result
      if (useCache) {
        await cacheService.set(
          CACHE_KEYS.USER_LIKED_TAGS(userId), 
          result, 
          300 // 5 minutes TTL
        );
      }

      return result;
    } catch (error) {
      logger.error('Error getting user preferred tags:', error);
      return [];
    }
  }

  /**
   * Get recently liked tags from user's like activity
   * @param {string} userId - User ID
   * @param {number} days - Number of days to look back
   * @returns {Array} Recently liked tags with counts
   */
  static async getRecentLikedTags(userId, days = 30) {
    try {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const recentLikes = await Like.aggregate([
        {
          $match: {
            user: userId,
            createdAt: { $gte: cutoffDate },
            isActive: true
          }
        },
        {
          $lookup: {
            from: 'posts',
            localField: 'post',
            foreignField: '_id',
            as: 'postInfo'
          }
        },
        { $unwind: '$postInfo' },
        { $unwind: '$postInfo.tags' },
        {
          $group: {
            _id: '$postInfo.tags',
            count: { $sum: 1 },
            lastLikedAt: { $max: '$createdAt' }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 50 }
      ]);

      return recentLikes.map(item => ({
        tag: item._id,
        count: item.count,
        lastLikedAt: item.lastLikedAt
      }));
    } catch (error) {
      logger.error('Error getting recent liked tags:', error);
      return [];
    }
  }

  /**
   * Calculate recency boost for tags
   * @param {Date} lastLikedAt - When the tag was last liked
   * @returns {number} Recency boost value
   */
  static getRecencyBoost(lastLikedAt) {
    if (!lastLikedAt) return 0;
    
    const daysSinceLiked = (Date.now() - lastLikedAt.getTime()) / (1000 * 60 * 60 * 24);
    
    // Recent activity gets higher boost
    if (daysSinceLiked <= 7) return 5;      // Last week
    if (daysSinceLiked <= 30) return 2;     // Last month
    if (daysSinceLiked <= 90) return 1;     // Last 3 months
    
    return 0;
  }

  /**
   * Get personalized post recommendations for user
   * @param {string} userId - User ID
   * @param {Object} options - Recommendation options
   * @returns {Array} Recommended posts
   */
  static async getPersonalizedRecommendations(userId, options = {}) {
    const {
      limit = 20,
      excludePostIds = [],
      includeFollowingPosts = true,
      diversityLevel = 0.3
    } = options;

    try {
      // Get user's preferred tags
      const preferredTags = await this.getUserPreferredTags(userId, { limit: 30 });
      const tagNames = preferredTags.map(pt => pt.tag);

      let matchConditions = {
        isActive: true,
        author: { $ne: userId }, // Exclude user's own posts
      };

      if (excludePostIds.length > 0) {
        matchConditions._id = { $nin: excludePostIds };
      }

      // Build aggregation pipeline
      const pipeline = [
        { $match: matchConditions },
        {
          $addFields: {
            // Calculate tag match score
            tagMatchScore: {
              $cond: {
                if: { $gt: [{ $size: tagNames }, 0] },
                then: {
                  $size: { $setIntersection: ['$tags', tagNames] }
                },
                else: 0
              }
            },
            // Calculate popularity score
            popularityScore: {
              $add: [
                { $multiply: ['$likesCount', 1] },
                { $multiply: ['$commentsCount', 0.5] },
                { $multiply: ['$sharesCount', 2] }
              ]
            },
            // Calculate recency score
            ageInHours: {
              $divide: [
                { $subtract: [new Date(), '$createdAt'] },
                1000 * 60 * 60
              ]
            }
          }
        },
        {
          $addFields: {
            recencyScore: {
              $cond: {
                if: { $lte: ['$ageInHours', 24] },
                then: 1,
                else: {
                  $divide: [24, { $add: ['$ageInHours', 1] }]
                }
              }
            }
          }
        },
        {
          $addFields: {
            // Final personalization score
            personalizationScore: {
              $add: [
                { $multiply: ['$tagMatchScore', 0.5] },
                { $multiply: [{ $ln: { $add: ['$popularityScore', 1] } }, 0.3] },
                { $multiply: ['$recencyScore', 0.2] }
              ]
            }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'author',
            foreignField: '_id',
            as: 'authorInfo'
          }
        },
        {
          $addFields: {
            author: { $arrayElemAt: ['$authorInfo', 0] }
          }
        },
        { $sort: { personalizationScore: -1, createdAt: -1 } },
        { $limit: limit * 2 }, // Get more posts for diversity filtering
        {
          $project: {
            authorInfo: 0,
            tagMatchScore: 0,
            popularityScore: 0,
            ageInHours: 0,
            recencyScore: 0
          }
        }
      ];

      let posts = await Post.aggregate(pipeline);

      // Apply diversity if requested
      if (diversityLevel > 0) {
        posts = this.applyContentDiversity(posts, diversityLevel);
      }

      return posts.slice(0, limit);
    } catch (error) {
      logger.error('Error getting personalized recommendations:', error);
      return [];
    }
  }

  /**
   * Apply content diversity to prevent similar posts from clustering
   * @param {Array} posts - Array of posts
   * @param {number} diversityLevel - Level of diversity to apply (0-1)
   * @returns {Array} Diversified posts
   */
  static applyContentDiversity(posts, diversityLevel = 0.3) {
    if (posts.length <= 2) return posts;

    const diversified = [posts[0]]; // Always include the top post
    const remaining = posts.slice(1);

    while (remaining.length > 0 && diversified.length < posts.length) {
      let nextPost = remaining[0]; // Default to next highest scored

      // Apply diversity logic
      if (Math.random() < diversityLevel && diversified.length > 0) {
        const lastPost = diversified[diversified.length - 1];
        
        // Find posts with different tags from the last post
        const diversePosts = remaining.filter(post => {
          const tagOverlap = this.calculateTagSimilarity(
            lastPost.tags || [], 
            post.tags || []
          );
          return tagOverlap < 0.5; // Less than 50% similarity
        });

        if (diversePosts.length > 0) {
          // Pick the highest scored diverse post
          nextPost = diversePosts[0];
        }
      }

      diversified.push(nextPost);
      remaining.splice(remaining.indexOf(nextPost), 1);
    }

    return diversified;
  }

  /**
   * Calculate similarity between two tag arrays
   * @param {Array} tags1 - First set of tags
   * @param {Array} tags2 - Second set of tags
   * @returns {number} Similarity score (0-1)
   */
  static calculateTagSimilarity(tags1, tags2) {
    if (!tags1 || !tags2 || tags1.length === 0 || tags2.length === 0) {
      return 0;
    }

    const set1 = new Set(tags1);
    const set2 = new Set(tags2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  /**
   * Update user preferences based on a new like
   * @param {string} userId - User ID
   * @param {string} postId - Post ID that was liked
   */
  static async updateUserPreferencesOnLike(userId, postId) {
    try {
      const post = await Post.findById(postId);
      if (!post || !post.tags || post.tags.length === 0) {
        return;
      }

      const user = await User.findById(userId);
      if (!user) {
        return;
      }

      // Update user's liked tags
      for (const tag of post.tags) {
        await user.addLikedTag(tag);
      }

      // Invalidate cache
      await cacheService.delete(CACHE_KEYS.USER_LIKED_TAGS(userId));
      
      logger.debug(`Updated preferences for user ${userId} with tags: ${post.tags.join(', ')}`);
    } catch (error) {
      logger.error('Error updating user preferences on like:', error);
    }
  }

  /**
   * Get similar users based on tag preferences
   * @param {string} userId - User ID
   * @param {Object} options - Options for finding similar users
   * @returns {Array} Similar users
   */
  static async getSimilarUsers(userId, options = {}) {
    const { limit = 10, minSimilarity = 0.1 } = options;

    try {
      const userTags = await this.getUserPreferredTags(userId, { limit: 50 });
      if (userTags.length === 0) return [];

      const userTagSet = new Set(userTags.map(ut => ut.tag));

      // Find users with similar tag preferences
      const similarUsers = await User.aggregate([
        {
          $match: {
            _id: { $ne: userId },
            'likedTags.tag': { $in: Array.from(userTagSet) }
          }
        },
        {
          $addFields: {
            similarityScore: {
              $size: {
                $setIntersection: [
                  '$likedTags.tag',
                  Array.from(userTagSet)
                ]
              }
            }
          }
        },
        {
          $match: {
            similarityScore: { $gte: Math.ceil(userTagSet.size * minSimilarity) }
          }
        },
        { $sort: { similarityScore: -1 } },
        { $limit: limit },
        {
          $project: {
            username: 1,
            firstName: 1,
            lastName: 1,
            profilePicture: 1,
            similarityScore: 1
          }
        }
      ]);

      return similarUsers;
    } catch (error) {
      logger.error('Error finding similar users:', error);
      return [];
    }
  }
}

module.exports = PersonalizationService;