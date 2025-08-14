const { 
    PERSONALIZATION_WEIGHT, 
    RECENCY_WEIGHT, 
    POPULARITY_WEIGHT,
    DAY_IN_MS 
  } = require('../utils/constants');
  const logger = require('../utils/logger');
  
  /**
   * Ranking Service for calculating post scores
   * Combines personalization, recency, and popularity into a unified score
   */
  class RankingService {
    /**
     * Calculate personalization score based on user's liked tags
     * @param {Array} postTags - Tags of the post
     * @param {Array} userLikedTags - User's preferred tags with counts
     * @returns {number} Personalization score (0-1)
     */
    static calculatePersonalizationScore(postTags, userLikedTags = []) {
      if (!postTags || postTags.length === 0 || !userLikedTags || userLikedTags.length === 0) {
        return 0;
      }
  
      // Create a map of user's tag preferences
      const userTagPreferences = new Map();
      let totalTagWeight = 0;
      
      userLikedTags.forEach(({ tag, count }) => {
        userTagPreferences.set(tag.toLowerCase(), count);
        totalTagWeight += count;
      });
  
      if (totalTagWeight === 0) return 0;
  
      // Calculate weighted match score
      let matchScore = 0;
      let matchedTags = 0;
  
      postTags.forEach(tag => {
        const tagLower = tag.toLowerCase();
        if (userTagPreferences.has(tagLower)) {
          const tagWeight = userTagPreferences.get(tagLower);
          matchScore += tagWeight / totalTagWeight;
          matchedTags++;
        }
      });
  
      // Normalize by the number of post tags to prevent bias toward posts with many tags
      const normalizedScore = postTags.length > 0 ? matchScore / Math.sqrt(postTags.length) : 0;
      
      // Boost score based on percentage of matched tags
      const matchPercentage = matchedTags / postTags.length;
      
      return Math.min(normalizedScore * (1 + matchPercentage), 1);
    }
  
    /**
     * Calculate recency score based on post age
     * @param {Date} createdAt - Post creation date
     * @returns {number} Recency score (0-1, newer posts get higher scores)
     */
    static calculateRecencyScore(createdAt) {
      if (!createdAt) return 0;
  
      const now = new Date();
      const ageInMs = now.getTime() - createdAt.getTime();
      const ageInDays = ageInMs / DAY_IN_MS;
  
      // Exponential decay - posts lose relevance over time
      // Score halves every 2 days
      const halfLife = 2; // days
      const decayFactor = Math.pow(0.5, ageInDays / halfLife);
      
      return Math.max(0, Math.min(1, decayFactor));
    }
  
    /**
     * Calculate popularity score based on engagement metrics
     * @param {Object} engagement - Engagement metrics
     * @param {number} engagement.likesCount - Number of likes
     * @param {number} engagement.commentsCount - Number of comments
     * @param {number} engagement.sharesCount - Number of shares
     * @param {number} engagement.viewsCount - Number of views
     * @param {Date} createdAt - Post creation date for time-adjusted popularity
     * @returns {number} Popularity score (0-1)
     */
    static calculatePopularityScore(engagement, createdAt) {
      const { 
        likesCount = 0, 
        commentsCount = 0, 
        sharesCount = 0, 
        viewsCount = 0 
      } = engagement;
  
      // Weighted engagement score (shares worth more than likes)
      const engagementScore = (likesCount * 1) + (commentsCount * 2) + (sharesCount * 3);
      
      // Calculate engagement rate
      const engagementRate = viewsCount > 0 ? engagementScore / viewsCount : 0;
      
      // Time-adjusted popularity (newer posts need fewer engagements to be popular)
      const ageInHours = createdAt ? (Date.now() - createdAt.getTime()) / (1000 * 60 * 60) : 0;
      const timeAdjustment = Math.max(0.1, Math.exp(-ageInHours / 24)); // Decay over 24 hours
      
      // Logarithmic scaling to prevent posts with extreme engagement from dominating
      const rawScore = Math.log(engagementScore + 1) / Math.log(1000); // Normalize to ~1000 max engagement
      const adjustedScore = rawScore * timeAdjustment;
      
      // Combine absolute engagement and engagement rate
      const finalScore = (adjustedScore * 0.7) + (engagementRate * 0.3);
      
      return Math.min(1, finalScore);
    }
  
    /**
     * Calculate overall ranking score for a post
     * @param {Object} post - Post object
     * @param {Array} userLikedTags - User's preferred tags
     * @returns {number} Combined ranking score
     */
    static calculateRankingScore(post, userLikedTags = []) {
      try {
        const personalizationScore = this.calculatePersonalizationScore(
          post.tags, 
          userLikedTags
        );
        
        const recencyScore = this.calculateRecencyScore(post.createdAt);
        
        const popularityScore = this.calculatePopularityScore(
          {
            likesCount: post.likesCount,
            commentsCount: post.commentsCount,
            sharesCount: post.sharesCount,
            viewsCount: post.viewsCount
          },
          post.createdAt
        );
  
        // Apply weights and calculate final score
        const finalScore = (
          (personalizationScore * PERSONALIZATION_WEIGHT) +
          (recencyScore * RECENCY_WEIGHT) +
          (popularityScore * POPULARITY_WEIGHT)
        );
  
        logger.debug('Ranking calculation', {
          postId: post._id,
          personalizationScore: personalizationScore.toFixed(3),
          recencyScore: recencyScore.toFixed(3),
          popularityScore: popularityScore.toFixed(3),
          finalScore: finalScore.toFixed(3)
        });
  
        return finalScore;
      } catch (error) {
        logger.error('Error calculating ranking score:', error);
        return 0;
      }
    }
  
    /**
     * Batch calculate ranking scores for multiple posts
     * @param {Array} posts - Array of post objects
     * @param {Array} userLikedTags - User's preferred tags
     * @returns {Array} Posts with calculated ranking scores
     */
    static calculateBatchRankingScores(posts, userLikedTags = []) {
      return posts.map(post => ({
        ...post,
        rankingScore: this.calculateRankingScore(post, userLikedTags),
        _personalizedFor: userLikedTags.length > 0 ? 'user' : 'general'
      }));
    }
  
    /**
     * Sort posts by ranking score
     * @param {Array} posts - Array of posts with ranking scores
     * @param {string} fallbackSort - Fallback sort method ('recent' | 'popular')
     * @returns {Array} Sorted posts
     */
    static sortByRanking(posts, fallbackSort = 'recent') {
      return posts.sort((a, b) => {
        // Primary sort by ranking score
        if (b.rankingScore !== a.rankingScore) {
          return b.rankingScore - a.rankingScore;
        }
        
        // Fallback sort for tied scores
        if (fallbackSort === 'popular') {
          const aPopularity = (a.likesCount || 0) + (a.commentsCount || 0) + (a.sharesCount || 0);
          const bPopularity = (b.likesCount || 0) + (b.commentsCount || 0) + (b.sharesCount || 0);
          return bPopularity - aPopularity;
        }
        
        // Default: sort by recency
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    }
  
    /**
     * Apply diversity to prevent similar content from clustering
     * @param {Array} posts - Ranked posts
     * @param {number} diversityFactor - How much to diversify (0-1)
     * @returns {Array} Diversified post order
     */
    static applyDiversity(posts, diversityFactor = 0.3) {
      if (posts.length <= 1 || diversityFactor <= 0) return posts;
  
      const diversified = [];
      const remaining = [...posts];
      
      // Take the top post
      if (remaining.length > 0) {
        diversified.push(remaining.shift());
      }
  
      while (remaining.length > 0) {
        const lastPost = diversified[diversified.length - 1];
        
        // Find posts that are different from the last post
        const different = remaining.filter(post => {
          const tagOverlap = this.calculateTagOverlap(lastPost.tags || [], post.tags || []);
          return tagOverlap < 0.5; // Less than 50% tag overlap
        });
        
        let nextPost;
        if (different.length > 0 && Math.random() < diversityFactor) {
          // Pick from diverse posts
          nextPost = different[0];
          remaining.splice(remaining.indexOf(nextPost), 1);
        } else {
          // Pick the next highest ranked post
          nextPost = remaining.shift();
        }
        
        diversified.push(nextPost);
      }
      
      return diversified;
    }
  
    /**
     * Calculate tag overlap between two tag arrays
     * @param {Array} tags1 - First set of tags
     * @param {Array} tags2 - Second set of tags
     * @returns {number} Overlap ratio (0-1)
     */
    static calculateTagOverlap(tags1, tags2) {
      if (!tags1 || !tags2 || tags1.length === 0 || tags2.length === 0) {
        return 0;
      }
      
      const set1 = new Set(tags1.map(tag => tag.toLowerCase()));
      const set2 = new Set(tags2.map(tag => tag.toLowerCase()));
      
      const intersection = new Set([...set1].filter(x => set2.has(x)));
      const union = new Set([...set1, ...set2]);
      
      return intersection.size / union.size;
    }
  }
  
  module.exports = RankingService;