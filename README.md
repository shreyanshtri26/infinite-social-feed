# Infinite Social Feed - Instagram-style Backend

A scalable Node.js backend API for an Instagram-style social media platform with infinite scrolling, personalized feeds, and intelligent ranking algorithms.

## 🚀 Features

### Core Features
- **User Authentication & Authorization** - JWT-based secure authentication
- **Posts Management** - Create, read, update, delete posts with images and tags
- **Infinite Scrolling Feed** - Optimized cursor-based pagination
- **Personalized Recommendations** - ML-powered content ranking based on user behavior
- **Intelligent Ranking System** - Combines recency, popularity, and personalization
- **Like System** - Posts can be liked/unliked with real-time counts
- **Tag System** - Hashtag-like tagging with trending analytics
- **Search Functionality** - Full-text search for posts and users
- **Caching Layer** - Redis-based caching for optimal performance
- **Rate Limiting** - Advanced rate limiting to prevent abuse

### Advanced Features
- **Personalization Engine** - Learns user preferences from interaction patterns
- **Content Diversity** - Prevents similar content from clustering in feeds
- **Trending Analysis** - Real-time trending tags and posts
- **Performance Optimization** - Database indexing, query optimization, and caching
- **Scalable Architecture** - Designed for horizontal scaling
- **Security** - Input validation, rate limiting, and security best practices

## 🏗️ System Architecture

### High-Level Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │────│   API Gateway   │────│   Rate Limiter  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
            ┌───────▼────────┐    ┌─────────▼─────────┐
            │  Auth Service  │    │  Content Service  │
            └────────────────┘    └───────────────────┘
                    │                       │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Ranking Service     │
                    └───────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
┌───────▼────────┐    ┌─────────▼─────────┐    ┌───────▼────────┐
│   MongoDB      │    │   Redis Cache     │    │  File Storage  │
│   (Primary DB) │    │   (Cache Layer)   │    │   (Images)     │
└────────────────┘    └───────────────────┘    └────────────────┘
```

### Database Design
- **MongoDB** - Primary database for scalability and flexibility
- **Redis** - Caching layer for session management and frequently accessed data
- **Indexes** - Optimized indexes for feed queries, search, and personalization

### Semantic Search Architecture (Future Enhancement)
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Search API    │────│  Vector Store   │────│  ML Pipeline    │
└─────────────────┘    │  (Embeddings)   │    │  (NLP Models)   │
         │              └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Elasticsearch/       │
                    │   Vector Database      │
                    │   (Pinecone/Weaviate) │
                    └────────────────────────┘
```

For semantic search implementation at scale:
1. **Text Embeddings** - Convert posts to vector embeddings using transformers
2. **Vector Database** - Store embeddings in specialized vector databases
3. **Similarity Search** - Use cosine similarity for semantic matching
4. **Hybrid Search** - Combine semantic search with traditional keyword search
5. **Real-time Updates** - Background processing for new content embeddings

## 🛠️ Tech Stack

### Core Technologies
- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose ODM
- **Cache**: Redis
- **Authentication**: JWT (JSON Web Tokens)
- **Validation**: Joi
- **Security**: Helmet, CORS, Rate Limiting
- **Logging**: Winston
- **Process Management**: PM2 (production)

### Development Tools
- **Testing**: Jest, Supertest
- **Containerization**: Docker, Docker Compose
- **Code Quality**: ESLint
- **Documentation**: JSDoc
- **CI/CD**: GitHub Actions ready

## 🚀 Quick Start

### Prerequisites
- Node.js 14+ 
- MongoDB 4.4+
- Redis 6+
- Docker (optional)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/shreyanshtri26/infinite-social-feed.git
cd infinite-social-feed
```

2. **Install dependencies**
```bash
npm install
```

3. **Environment Configuration**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start MongoDB and Redis**
```bash
# Using Docker
docker-compose up -d mongo redis

# Or install locally
# MongoDB: https://docs.mongodb.com/manual/installation/
# Redis: https://redis.io/download
```

5. **Run the application**
```bash
# Development mode
npm run dev

# Production mode
npm start
```

6. **Verify installation**
```bash
curl http://localhost:3000/health
```

### Docker Setup (Recommended)

1. **Using Docker Compose**
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

2. **Individual container**
```bash
# Build image
docker build -t infinite-social-feed .

# Run container
docker run -p 3000:3000 infinite-social-feed
```

## 📖 API Documentation

### Authentication Endpoints
```
POST /api/auth/register         # Register new user
POST /api/auth/login           # User login
GET  /api/auth/me              # Get current user
POST /api/auth/refresh         # Refresh JWT token
POST /api/auth/logout          # User logout
GET  /api/auth/validate        # Validate session
```

### Posts Endpoints
```
POST /api/posts                # Create new post
GET  /api/posts                # Get posts (paginated)
GET  /api/posts/:id            # Get specific post
PUT  /api/posts/:id            # Update post (author only)
DELETE /api/posts/:id          # Delete post (author only)
POST /api/posts/:id/like       # Like/unlike post
GET  /api/posts/:id/likes      # Get post likes
GET  /api/posts/search         # Search posts
GET  /api/posts/tag/:tag       # Get posts by tag
GET  /api/posts/trending-tags  # Get trending tags
```

### Feed Endpoints (Core Feature)
```
GET  /api/feed                 # Personalized/General feed
GET  /api/feed/personalized    # Personalized feed (auth required)
GET  /api/feed/general         # General feed
GET  /api/feed/recommendations # AI recommendations
GET  /api/feed/trending        # Trending posts
DELETE /api/feed/cache         # Clear feed cache
```

### User Endpoints
```
GET  /api/users/search         # Search users
PUT  /api/users/profile        # Update profile
GET  /api/users/liked-posts    # Get liked posts
GET  /api/users/preferred-tags # Get user's preferred tags
GET  /api/users/similar        # Get similar users
GET  /api/users/stats          # User statistics
GET  /api/users/:username      # Get user profile
GET  /api/users/:username/posts # Get user's posts
```

### Example API Usage

#### Register User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com",
    "password": "password123",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

#### Create Post
```bash
curl -X POST http://localhost:3000/api/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "content": "My first post! #hello #world",
    "tags": ["hello", "world", "firstpost"],
    "imageUrl": "https://example.com/image.jpg"
  }'
```

#### Get Personalized Feed
```bash
curl -X GET "http://localhost:3000/api/feed?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🧠 Ranking Algorithm

The intelligent ranking system combines three key factors:

### 1. Personalization Score (40% weight)
- **Tag Matching**: Posts with tags user frequently likes get higher scores
- **Interaction History**: Based on user's past engagement patterns  
- **Similarity Analysis**: Content similar to previously liked posts
- **Recency Boost**: Recent user preferences get higher priority

```javascript
// Personalization calculation
personalizationScore = (matchedTags / totalTags) * userTagPreference * recencyBoost
```

### 2. Recency Score (30% weight)  
- **Time Decay**: Exponential decay favoring newer content
- **Half-life**: Posts lose relevance over 2-day periods
- **Real-time Updates**: Continuous score recalculation

```javascript
// Recency calculation  
recencyScore = Math.pow(0.5, ageInDays / halfLifeDays)
```

### 3. Popularity Score (30% weight)
- **Engagement Metrics**: Likes, comments, shares with different weights
- **Engagement Rate**: Interactions per view ratio
- **Time-adjusted**: Recent engagement weighted higher
- **Logarithmic Scaling**: Prevents viral posts from dominating

```javascript
// Popularity calculation
popularityScore = log(engagementScore + 1) * timeAdjustment * engagementRate
```

### Final Ranking Formula
```javascript
finalScore = (personalizationScore * 0.4) + (recencyScore * 0.3) + (popularityScore * 0.3)
```

## 🔧 Configuration

### Environment Variables
```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/infinite-social-feed
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Authentication
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Feed Configuration
FEED_CACHE_TTL=300
PERSONALIZATION_WEIGHT=0.4
RECENCY_WEIGHT=0.3
POPULARITY_WEIGHT=0.3

# File Upload (if using Cloudinary)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

### Performance Tuning
```javascript
// MongoDB Indexes
db.posts.createIndex({ author: 1, createdAt: -1 })
db.posts.createIndex({ tags: 1, createdAt: -1 })
db.posts.createIndex({ rankingScore: -1, createdAt: -1 })
db.posts.createIndex({ content: "text", tags: "text" })

// Redis Configuration
redis.conf:
maxmemory 2gb
maxmemory-policy allkeys-lru
save 900 1
```

## 📊 Performance & Scalability

### Database Optimization
- **Compound Indexes**: Optimized for feed queries
- **Aggregation Pipelines**: Efficient data processing  
- **Connection Pooling**: MongoDB connection management
- **Query Optimization**: Minimized database round trips

### Caching Strategy
- **Feed Caching**: User feeds cached for 5 minutes
- **User Preferences**: Tag preferences cached
- **Rate Limiting**: Redis-based rate limiting
- **Session Management**: JWT with Redis blacklisting

### Performance Metrics
- **Response Time**: < 200ms for cached requests
- **Throughput**: 1000+ requests/second (with proper scaling)
- **Memory Usage**: < 512MB baseline
- **Database Queries**: < 50ms average query time

### Scaling Recommendations
1. **Horizontal Scaling**: Multiple app instances behind load balancer
2. **Database Sharding**: Distribute data across MongoDB shards  
3. **CDN Integration**: Static content delivery
4. **Microservices**: Split into separate services as needed
5. **Queue System**: Background job processing with Bull/Redis

## 🔒 Security Features

### Authentication & Authorization
- **JWT Tokens**: Stateless authentication
- **Password Hashing**: Bcrypt with salt rounds
- **Token Expiration**: Configurable token lifetime
- **Refresh Tokens**: Secure token renewal

### Input Validation & Sanitization
- **Joi Validation**: Comprehensive input validation
- **XSS Protection**: Content sanitization
- **SQL Injection**: MongoDB parameter binding
- **File Upload**: Type and size restrictions

### Rate Limiting & DDoS Protection
- **Global Rate Limits**: API-wide request limiting
- **Endpoint-specific Limits**: Granular rate controls
- **IP-based Limiting**: Per-IP restrictions
- **Sliding Window**: Advanced rate limiting algorithm

### Security Headers & CORS
- **Helmet.js**: Security headers middleware
- **CORS Configuration**: Cross-origin request handling
- **Content Security Policy**: XSS attack prevention
- **HTTPS Enforcement**: SSL/TLS in production


### Environment Setup
```bash
# Production environment variables
NODE_ENV=production
PORT=3000

# Use MongoDB Atlas or managed MongoDB
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname 
//user will be your username and pass replace with your password

# Use Redis Cloud or managed Redis
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# Strong JWT secret
JWT_SECRET=your-256-bit-secret

# Configure logging
LOG_LEVEL=info
```

## 📈 Monitoring & Analytics

### Health Monitoring
```bash
# Health check endpoint
GET /health

# Application metrics
GET /metrics (if implemented)

# Cache statistics
GET /api/admin/cache/stats
```

### Logging Strategy
- **Winston Logger**: Structured logging
- **Log Levels**: Error, Warn, Info, Debug
- **Log Rotation**: Automatic log file management
- **Error Tracking**: Integration ready (Sentry, etc.)

### Performance Monitoring
- **Response Times**: API endpoint performance
- **Database Queries**: Slow query identification
- **Memory Usage**: Application memory monitoring
- **Cache Hit Rates**: Redis performance metrics


##  Acknowledgments

- Express.js team for the robust web framework
- MongoDB team for the scalable database solution
- Redis team for the high-performance cache
- Open source community for the amazing libraries

