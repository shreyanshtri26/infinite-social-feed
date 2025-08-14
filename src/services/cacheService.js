const redis = require('redis');
const logger = require('../utils/logger');

/**
 * Cache Service using Redis for high-performance caching
 */
class CacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.init();
  }

  /**
   * Initialize Redis connection
   */
  async init() {
    try {
      this.client = redis.createClient({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        retryDelayOnFailover: 100,
        retryDelayOnClusterDown: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      });

      // Event handlers
      this.client.on('connect', () => {
        logger.info('📦 Redis connecting...');
      });

      this.client.on('ready', () => {
        this.isConnected = true;
        logger.info('✅ Redis connected and ready');
      });

      this.client.on('error', (error) => {
        this.isConnected = false;
        logger.error('❌ Redis connection error:', error);
      });

      this.client.on('end', () => {
        this.isConnected = false;
        logger.warn('⚠️  Redis connection ended');
      });

      // Connect to Redis
      await this.client.connect();
    } catch (error) {
      logger.error('❌ Failed to initialize Redis:', error);
      this.isConnected = false;
    }
  }

  /**
   * Check if cache is available
   * @returns {boolean} Cache availability status
   */
  isAvailable() {
    return this.isConnected && this.client && this.client.isReady;
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or null
   */
  async get(key) {
    if (!this.isAvailable()) {
      logger.debug('Cache not available, skipping get operation');
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (value === null) return null;

      // Try to parse JSON, return as string if parsing fails
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      logger.error(`Error getting key ${key} from cache:`, error);
      return null;
    }
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttl - Time to live in seconds (optional)
   * @returns {boolean} Success status
   */
  async set(key, value, ttl = null) {
    if (!this.isAvailable()) {
      logger.debug('Cache not available, skipping set operation');
      return false;
    }

    try {
      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      
      if (ttl) {
        await this.client.setEx(key, ttl, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }
      
      return true;
    } catch (error) {
      logger.error(`Error setting key ${key} in cache:`, error);
      return false;
    }
  }

  /**
   * Delete key from cache
   * @param {string} key - Cache key to delete
   * @returns {boolean} Success status
   */
  async delete(key) {
    if (!this.isAvailable()) {
      logger.debug('Cache not available, skipping delete operation');
      return false;
    }

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error(`Error deleting key ${key} from cache:`, error);
      return false;
    }
  }

  /**
   * Delete multiple keys from cache
   * @param {Array} keys - Array of cache keys to delete
   * @returns {number} Number of deleted keys
   */
  async deleteMany(keys) {
    if (!this.isAvailable() || !keys || keys.length === 0) {
      return 0;
    }

    try {
      return await this.client.del(keys);
    } catch (error) {
      logger.error('Error deleting multiple keys from cache:', error);
      return 0;
    }
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean} Key existence status
   */
  async exists(key) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Error checking existence of key ${key}:`, error);
      return false;
    }
  }

  /**
   * Set expiration time for a key
   * @param {string} key - Cache key
   * @param {number} ttl - Time to live in seconds
   * @returns {boolean} Success status
   */
  async expire(key, ttl) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      await this.client.expire(key, ttl);
      return true;
    } catch (error) {
      logger.error(`Error setting expiration for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Increment a numeric value in cache
   * @param {string} key - Cache key
   * @param {number} increment - Increment value (default: 1)
   * @returns {number} New value after increment
   */
  async increment(key, increment = 1) {
    if (!this.isAvailable()) {
      return 0;
    }

    try {
      return await this.client.incrBy(key, increment);
    } catch (error) {
      logger.error(`Error incrementing key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Get multiple values from cache
   * @param {Array} keys - Array of cache keys
   * @returns {Array} Array of values
   */
  async getMany(keys) {
    if (!this.isAvailable() || !keys || keys.length === 0) {
      return [];
    }

    try {
      const values = await this.client.mGet(keys);
      return values.map(value => {
        if (value === null) return null;
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      });
    } catch (error) {
      logger.error('Error getting multiple keys from cache:', error);
      return new Array(keys.length).fill(null);
    }
  }

  /**
   * Set multiple key-value pairs in cache
   * @param {Object} keyValuePairs - Object with key-value pairs
   * @param {number} ttl - Time to live in seconds (optional)
   * @returns {boolean} Success status
   */
  async setMany(keyValuePairs, ttl = null) {
    if (!this.isAvailable() || !keyValuePairs || Object.keys(keyValuePairs).length === 0) {
      return false;
    }

    try {
      const pipeline = this.client.multi();
      
      for (const [key, value] of Object.entries(keyValuePairs)) {
        const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
        pipeline.set(key, serializedValue);
        
        if (ttl) {
          pipeline.expire(key, ttl);
        }
      }
      
      await pipeline.exec();
      return true;
    } catch (error) {
      logger.error('Error setting multiple keys in cache:', error);
      return false;
    }
  }

  /**
   * Add item to a list (Redis LIST)
   * @param {string} key - List key
   * @param {*} value - Value to add
   * @param {string} position - 'left' or 'right' (default: 'right')
   * @returns {number} New length of the list
   */
  async listPush(key, value, position = 'right') {
    if (!this.isAvailable()) {
      return 0;
    }

    try {
      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      
      if (position === 'left') {
        return await this.client.lPush(key, serializedValue);
      } else {
        return await this.client.rPush(key, serializedValue);
      }
    } catch (error) {
      logger.error(`Error pushing to list ${key}:`, error);
      return 0;
    }
  }

  /**
   * Get items from a list
   * @param {string} key - List key
   * @param {number} start - Start index (default: 0)
   * @param {number} stop - Stop index (default: -1, means all)
   * @returns {Array} Array of items
   */
  async listRange(key, start = 0, stop = -1) {
    if (!this.isAvailable()) {
      return [];
    }

    try {
      const values = await this.client.lRange(key, start, stop);
      return values.map(value => {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      });
    } catch (error) {
      logger.error(`Error getting list range for ${key}:`, error);
      return [];
    }
  }

  /**
   * Add member to a set (Redis SET)
   * @param {string} key - Set key
   * @param {*} value - Value to add
   * @returns {boolean} Success status
   */
  async setAdd(key, value) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      const result = await this.client.sAdd(key, serializedValue);
      return result === 1;
    } catch (error) {
      logger.error(`Error adding to set ${key}:`, error);
      return false;
    }
  }

  /**
   * Get all members of a set
   * @param {string} key - Set key
   * @returns {Array} Array of set members
   */
  async setMembers(key) {
    if (!this.isAvailable()) {
      return [];
    }

    try {
      const values = await this.client.sMembers(key);
      return values.map(value => {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      });
    } catch (error) {
      logger.error(`Error getting set members for ${key}:`, error);
      return [];
    }
  }

  /**
   * Clear all cache (use with caution)
   * @returns {boolean} Success status
   */
  async clear() {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      await this.client.flushDb();
      logger.info('🧹 Cache cleared successfully');
      return true;
    } catch (error) {
      logger.error('Error clearing cache:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  async getStats() {
    if (!this.isAvailable()) {
      return {
        connected: false,
        keys: 0,
        memory: '0B'
      };
    }

    try {
      const info = await this.client.info('memory');
      const dbSize = await this.client.dbSize();
      
      // Parse memory usage from info string
      const memoryMatch = info.match(/used_memory_human:(.+)\r\n/);
      const memory = memoryMatch ? memoryMatch[1] : '0B';

      return {
        connected: true,
        keys: dbSize,
        memory: memory.trim()
      };
    } catch (error) {
      logger.error('Error getting cache stats:', error);
      return {
        connected: false,
        keys: 0,
        memory: '0B',
        error: error.message
      };
    }
  }

  /**
   * Close cache connection
   */
  async close() {
    if (this.client) {
      try {
        await this.client.quit();
        logger.info('📦 Redis connection closed');
      } catch (error) {
        logger.error('Error closing Redis connection:', error);
      }
    }
  }

  /**
   * Health check for cache service
   * @returns {Object} Health check result
   */
  async healthCheck() {
    try {
      if (!this.isAvailable()) {
        return {
          status: 'unhealthy',
          message: 'Redis client not available',
          timestamp: new Date().toISOString()
        };
      }

      // Test basic operations
      const testKey = 'health_check_' + Date.now();
      const testValue = 'ok';
      
      await this.set(testKey, testValue, 1); // 1 second TTL
      const retrievedValue = await this.get(testKey);
      
      if (retrievedValue === testValue) {
        return {
          status: 'healthy',
          message: 'Cache is working properly',
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          status: 'unhealthy',
          message: 'Cache read/write test failed',
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      logger.error('Cache health check failed:', error);
      return {
        status: 'unhealthy',
        message: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Create and export singleton instance
const cacheService = new CacheService();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await cacheService.close();
});

process.on('SIGINT', async () => {
  await cacheService.close();
});

module.exports = cacheService;