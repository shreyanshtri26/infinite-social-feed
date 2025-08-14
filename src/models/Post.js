const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Post author is required'],
    index: true
  },
  content: {
    type: String,
    required: [true, 'Post content is required'],
    trim: true,
    maxlength: [2200, 'Post content cannot exceed 2200 characters']
  },
  imageUrl: {
    type: String,
    trim: true,
    default: ''
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: [50, 'Tag cannot exceed 50 characters']
  }],
  likesCount: {
    type: Number,
    default: 0,
    min: 0
  },
  commentsCount: {
    type: Number,
    default: 0,
    min: 0
  },
  sharesCount: {
    type: Number,
    default: 0,
    min: 0
  },
  viewsCount: {
    type: Number,
    default: 0,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  reportCount: {
    type: Number,
    default: 0,
    min: 0
  },
  // Engagement metrics for ranking
  engagementRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 1
  },
  // Calculated score for feed ranking
  rankingScore: {
    type: Number,
    default: 0,
    index: true
  },
  // Performance metrics
  performance: {
    hourlyViews: {
      type: Number,
      default: 0
    },
    dailyViews: {
      type: Number,
      default: 0
    },
    weeklyViews: {
      type: Number,
      default: 0
    },
    lastCalculatedAt: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance optimization
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ tags: 1, createdAt: -1 });
postSchema.index({ likesCount: -1, createdAt: -1 });
postSchema.index({ rankingScore: -1, createdAt: -1 });
postSchema.index({ isActive: 1, createdAt: -1 });
postSchema.index({ createdAt: -1 });

// Compound index for feed queries
postSchema.index({ 
  isActive: 1, 
  rankingScore: -1, 
  createdAt: -1 
});

// Text index for search functionality
postSchema.index({ 
  content: 'text', 
  tags: 'text' 
}, {
  weights: {
    tags: 10,
    content: 5
  }
});

// Virtual for post age in hours
postSchema.virtual('ageInHours').get(function() {
  return Math.floor((Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60));
});

// Virtual for engagement score
postSchema.virtual('engagementScore').get(function() {
  const totalInteractions = this.likesCount + this.commentsCount + this.sharesCount;
  const views = Math.max(this.viewsCount, 1);
  return totalInteractions / views;
});

// Validate tags array length and content
postSchema.pre('validate', function(next) {
  if (this.tags && this.tags.length > 30) {
    return next(new Error('Cannot have more than 30 tags per post'));
  }
  
  // Clean and validate tags
  if (this.tags && this.tags.length > 0) {
    this.tags = this.tags
      .filter(tag => tag && tag.trim().length > 0)
      .map(tag => tag.trim().toLowerCase().replace(/[^a-zA-Z0-9_]/g, ''))
      .filter(tag => tag.length > 0)
      .slice(0, 30);
    
    // Remove duplicates
    this.tags = [...new Set(this.tags)];
  }
  
  next();
});

// Update engagement rate before saving
postSchema.pre('save', function(next) {
  if (this.isModified('likesCount') || this.isModified('commentsCount') || 
      this.isModified('sharesCount') || this.isModified('viewsCount')) {
    this.updateEngagementRate();
  }
  next();
});

// Method to update engagement rate
postSchema.methods.updateEngagementRate = function() {
  const totalInteractions = this.likesCount + this.commentsCount + this.sharesCount;
  const views = Math.max(this.viewsCount, 1);
  this.engagementRate = Math.min(totalInteractions / views, 1);
};

// Method to increment view count
postSchema.methods.incrementViews = function() {
  this.viewsCount += 1;
  this.performance.hourlyViews += 1;
  this.performance.dailyViews += 1;
  this.performance.weeklyViews += 1;
  this.updateEngagementRate();
  return this.save();
};

// Method to increment likes
postSchema.methods.incrementLikes = function() {
  this.likesCount += 1;
  this.updateEngagementRate();
  return this.save();
};

// Method to decrement likes
postSchema.methods.decrementLikes = function() {
  this.likesCount = Math.max(0, this.likesCount - 1);
  this.updateEngagementRate();
  return this.save();
};

// Static method to get trending tags
postSchema.statics.getTrendingTags = async function(limit = 10, timeframe = 24) {
  const hoursAgo = new Date(Date.now() - timeframe * 60 * 60 * 1000);
  
  const trending = await this.aggregate([
    {
      $match: {
        createdAt: { $gte: hoursAgo },
        isActive: true
      }
    },
    { $unwind: '$tags' },
    {
      $group: {
        _id: '$tags',
        count: { $sum: 1 },
        totalLikes: { $sum: '$likesCount' },
        totalViews: { $sum: '$viewsCount' }
      }
    },
    {
      $addFields: {
        trendingScore: {
          $add: [
            { $multiply: ['$count', 1] },
            { $multiply: ['$totalLikes', 0.5] },
            { $multiply: ['$totalViews', 0.1] }
          ]
        }
      }
    },
    { $sort: { trendingScore: -1 } },
    { $limit: limit }
  ]);
  
  return trending.map(item => ({
    tag: item._id,
    count: item.count,
    totalLikes: item.totalLikes,
    totalViews: item.totalViews,
    trendingScore: item.trendingScore
  }));
};

// Static method to get posts for feed with ranking
postSchema.statics.getFeedPosts = async function(options = {}) {
  const {
    userId,
    userTags = [],
    limit = 20,
    skip = 0,
    excludePostIds = []
  } = options;

  const pipeline = [
    {
      $match: {
        isActive: true,
        ...(excludePostIds.length > 0 && { _id: { $nin: excludePostIds } })
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
        author: { $arrayElemAt: ['$authorInfo', 0] },
        // Calculate personalization score based on tag matches
        personalizationScore: {
          $cond: {
            if: { $gt: [{ $size: userTags }, 0] },
            then: {
              $divide: [
                { $size: { $setIntersection: ['$tags', userTags] } },
                { $max: [{ $size: '$tags' }, 1] }
              ]
            },
            else: 0
          }
        },
        // Calculate recency score (newer posts get higher score)
        recencyScore: {
          $divide: [
            { $subtract: [new Date(), '$createdAt'] },
            1000 * 60 * 60 * 24 // Convert to days
          ]
        },
        // Calculate popularity score
        popularityScore: {
          $add: [
            { $multiply: ['$likesCount', 1] },
            { $multiply: ['$commentsCount', 0.5] },
            { $multiply: ['$sharesCount', 2] }
          ]
        }
      }
    },
    {
      $addFields: {
        // Normalize recency score (newer = higher score)
        normalizedRecency: {
          $subtract: [1, { $min: [{ $divide: ['$recencyScore', 7] }, 1] }]
        }
      }
    },
    {
      $addFields: {
        // Calculate final ranking score
        finalScore: {
          $add: [
            { $multiply: ['$personalizationScore', 0.4] },
            { $multiply: ['$normalizedRecency', 0.3] },
            { $multiply: [{ $ln: { $add: ['$popularityScore', 1] } }, 0.3] }
          ]
        }
      }
    },
    { $sort: { finalScore: -1, createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $project: {
        authorInfo: 0,
        recencyScore: 0,
        personalizationScore: 0,
        popularityScore: 0,
        normalizedRecency: 0
      }
    }
  ];

  return await this.aggregate(pipeline);
};

module.exports = mongoose.model('Post', postSchema);