const mongoose = require('mongoose');

const likeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true
  },
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: [true, 'Post is required'],
    index: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound indexes for performance
likeSchema.index({ user: 1, post: 1 }, { unique: true });
likeSchema.index({ post: 1, createdAt: -1 });
likeSchema.index({ user: 1, createdAt: -1 });

// Static method to check if user liked a post
likeSchema.statics.isLiked = async function(userId, postId) {
  const like = await this.findOne({
    user: userId,
    post: postId,
    isActive: true
  });
  return !!like;
};

// Static method to get user's liked posts
likeSchema.statics.getUserLikedPosts = async function(userId, options = {}) {
  const { limit = 20, skip = 0 } = options;
  
  return await this.find({
    user: userId,
    isActive: true
  })
  .populate({
    path: 'post',
    populate: {
      path: 'author',
      select: 'username firstName lastName profilePicture'
    }
  })
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(limit);
};

// Static method to get post likes with user info
likeSchema.statics.getPostLikes = async function(postId, options = {}) {
  const { limit = 20, skip = 0 } = options;
  
  return await this.find({
    post: postId,
    isActive: true
  })
  .populate('user', 'username firstName lastName profilePicture')
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(limit);
};

// Static method to get likes count for multiple posts
likeSchema.statics.getPostsLikesCount = async function(postIds) {
  const counts = await this.aggregate([
    {
      $match: {
        post: { $in: postIds },
        isActive: true
      }
    },
    {
      $group: {
        _id: '$post',
        count: { $sum: 1 }
      }
    }
  ]);
  
  const countMap = {};
  counts.forEach(item => {
    countMap[item._id.toString()] = item.count;
  });
  
  return countMap;
};

// Static method to bulk check likes for a user
likeSchema.statics.checkUserLikes = async function(userId, postIds) {
  const likes = await this.find({
    user: userId,
    post: { $in: postIds },
    isActive: true
  }, 'post');
  
  const likedPostIds = new Set(likes.map(like => like.post.toString()));
  
  return postIds.map(postId => ({
    postId: postId.toString(),
    isLiked: likedPostIds.has(postId.toString())
  }));
};

module.exports = mongoose.model('Like', likeSchema);