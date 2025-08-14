const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters long'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long'],
    select: false
  },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  bio: {
    type: String,
    trim: true,
    maxlength: [150, 'Bio cannot exceed 150 characters'],
    default: ''
  },
  profilePicture: {
    type: String,
    default: ''
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  followersCount: {
    type: Number,
    default: 0,
    min: 0
  },
  followingCount: {
    type: Number,
    default: 0,
    min: 0
  },
  postsCount: {
    type: Number,
    default: 0,
    min: 0
  },
  likedTags: [{
    tag: {
      type: String,
      trim: true,
      lowercase: true
    },
    count: {
      type: Number,
      default: 1,
      min: 1
    },
    lastLikedAt: {
      type: Date,
      default: Date.now
    }
  }],
  preferences: {
    isPrivate: {
      type: Boolean,
      default: false
    },
    allowComments: {
      type: Boolean,
      default: true
    },
    showOnlineStatus: {
      type: Boolean,
      default: true
    }
  },
  lastActiveAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ 'likedTags.tag': 1 });
userSchema.index({ lastActiveAt: -1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Update lastActiveAt when user performs actions
userSchema.pre(['find', 'findOne', 'findOneAndUpdate'], function() {
  this.set({ lastActiveAt: new Date() });
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT token
userSchema.methods.generateToken = function() {
  return jwt.sign(
    { 
      id: this._id, 
      username: this.username,
      email: this.email 
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// Add liked tag or increment count
userSchema.methods.addLikedTag = function(tag) {
  const existingTag = this.likedTags.find(lt => lt.tag === tag.toLowerCase());
  
  if (existingTag) {
    existingTag.count += 1;
    existingTag.lastLikedAt = new Date();
  } else {
    this.likedTags.push({
      tag: tag.toLowerCase(),
      count: 1,
      lastLikedAt: new Date()
    });
  }
  
  // Keep only top 100 tags to prevent memory issues
  if (this.likedTags.length > 100) {
    this.likedTags.sort((a, b) => b.count - a.count);
    this.likedTags = this.likedTags.slice(0, 100);
  }
  
  return this.save();
};

// Get user's preferred tags (top liked tags)
userSchema.methods.getPreferredTags = function(limit = 20) {
  return this.likedTags
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(lt => lt.tag);
};

// Remove sensitive data from JSON output
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.__v;
  return userObject;
};

module.exports = mongoose.model('User', userSchema);