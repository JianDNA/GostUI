/**
 * 简化的缓存服务
 * 
 * 设计理念：
 * 1. 移除复杂的多实例文件锁机制
 * 2. 使用简单的内存缓存 + 定期刷新
 * 3. 减少不必要的同步开销
 * 4. 保留核心功能：用户数据缓存、端口映射
 */

const { User, UserForwardRule } = require('../models');

class SimplifiedCacheService {
  constructor() {
    // 简化的内存缓存
    this.userCache = new Map();
    this.portUserMapping = new Map();
    
    // 简化的配置
    this.config = {
      cacheTTL: 5 * 60 * 1000,    // 5分钟缓存
      syncInterval: 60 * 1000,    // 1分钟同步一次（减少频率）
      maxCacheSize: 1000          // 最大缓存条目数
    };
    
    // 定时器
    this.syncTimer = null;
    this.cleanupTimer = null;
    
    // 统计信息
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      lastSync: null,
      syncCount: 0
    };
    
    console.log('🚀 简化缓存服务初始化');
  }

  /**
   * 初始化缓存服务
   */
  async initialize() {
    try {
      // 初始加载数据
      await this.syncCache();
      
      // 启动定时同步（频率降低）
      this.startSyncTimer();
      
      // 启动清理定时器
      this.startCleanupTimer();
      
      console.log('✅ 简化缓存服务初始化成功');
      return true;
    } catch (error) {
      console.error('❌ 简化缓存服务初始化失败:', error);
      throw error;
    }
  }

  /**
   * 同步缓存数据（简化版）
   */
  async syncCache() {
    try {
      // 获取用户数据
      const users = await User.findAll({
        attributes: ['id', 'username', 'role', 'expiryDate', 'trafficQuota', 'usedTraffic']
      });

      // 🔧 修复: 获取所有规则，然后使用计算属性过滤活跃规则
      const allRules = await UserForwardRule.findAll({
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'role', 'isActive', 'userStatus', 'expiryDate', 'portRangeStart', 'portRangeEnd', 'trafficQuota', 'usedTraffic']
        }]
      });

      // 🔧 修复: 使用计算属性过滤活跃规则
      const rules = allRules.filter(rule => {
        if (!rule.user) return false;

        // 手动计算 isActive 状态
        const user = rule.user;
        const isUserActive = user.isActive && user.userStatus === 'active';
        const isNotExpired = !user.expiryDate || new Date(user.expiryDate) > new Date();
        const hasTrafficQuota = !user.trafficQuota || (user.usedTraffic || 0) < (user.trafficQuota * 1024 * 1024 * 1024);

        return isUserActive && isNotExpired && hasTrafficQuota;
      });

      // 更新用户缓存
      this.userCache.clear();
      for (const user of users) {
        const isActive = !user.expiryDate || new Date(user.expiryDate) > new Date();
        
        this.userCache.set(user.id, {
          id: user.id,
          username: user.username,
          role: user.role || 'user',
          expiryDate: user.expiryDate,
          trafficQuota: user.trafficQuota,
          trafficLimitBytes: user.trafficQuota * 1024 * 1024 * 1024,
          usedTraffic: user.usedTraffic || 0,
          isActive: isActive,
          cacheTime: Date.now()
        });
      }

      // 更新端口映射
      this.portUserMapping.clear();
      for (const rule of rules) {
        if (rule.user) {
          const user = this.userCache.get(rule.user.id);
          if (user && user.isActive) {
            this.portUserMapping.set(rule.sourcePort, {
              userId: rule.user.id,
              username: rule.user.username,
              ruleId: rule.id,
              ruleName: rule.name
            });
          }
        }
      }

      // 更新统计信息
      this.stats.lastSync = new Date();
      this.stats.syncCount++;

      console.log(`🔄 缓存同步完成: ${users.length}用户, ${this.portUserMapping.size}端口`);
      
    } catch (error) {
      console.error('❌ 缓存同步失败:', error);
      throw error;
    }
  }

  /**
   * 获取用户数据
   */
  getUserCache(userId) {
    const user = this.userCache.get(userId);
    
    if (!user) {
      this.stats.cacheMisses++;
      return null;
    }

    // 检查缓存是否过期
    if (Date.now() - user.cacheTime > this.config.cacheTTL) {
      this.userCache.delete(userId);
      this.stats.cacheMisses++;
      return null;
    }

    this.stats.cacheHits++;
    return user;
  }

  /**
   * 更新用户缓存
   */
  setUserCache(userId, userData) {
    // 检查缓存大小限制
    if (this.userCache.size >= this.config.maxCacheSize) {
      this.cleanupOldestCache();
    }

    this.userCache.set(userId, {
      ...userData,
      cacheTime: Date.now()
    });
  }

  /**
   * 获取端口用户映射
   */
  getPortUserMapping() {
    const result = {};
    for (const [port, mapping] of this.portUserMapping.entries()) {
      result[port] = mapping;
    }
    return result;
  }

  /**
   * 更新用户流量
   */
  async updateUserTraffic(userId, additionalBytes) {
    try {
      // 更新数据库
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error(`用户 ${userId} 不存在`);
      }

      const newUsedTraffic = (user.usedTraffic || 0) + additionalBytes;
      await user.update({ usedTraffic: newUsedTraffic });

      // 更新缓存
      const cachedUser = this.getUserCache(userId);
      if (cachedUser) {
        cachedUser.usedTraffic = newUsedTraffic;
        this.setUserCache(userId, cachedUser);
      }

      return newUsedTraffic;
    } catch (error) {
      console.error(`❌ 更新用户 ${userId} 流量失败:`, error);
      throw error;
    }
  }

  /**
   * 清除用户缓存
   */
  clearUserCache(userId) {
    this.userCache.delete(userId);
  }

  /**
   * 重置用户流量缓存
   */
  async resetUserTrafficCache(userId) {
    const cachedUser = this.getUserCache(userId);
    if (cachedUser) {
      cachedUser.usedTraffic = 0;
      this.setUserCache(userId, cachedUser);
    }
  }

  /**
   * 启动同步定时器
   */
  startSyncTimer() {
    this.syncTimer = setInterval(async () => {
      try {
        await this.syncCache();
      } catch (error) {
        console.error('❌ 定时同步失败:', error);
      }
    }, this.config.syncInterval);

    console.log(`⏰ 缓存同步定时器已启动，间隔: ${this.config.syncInterval / 1000}秒`);
  }

  /**
   * 启动清理定时器
   */
  startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredCache();
    }, 5 * 60 * 1000); // 5分钟清理一次

    console.log('⏰ 缓存清理定时器已启动');
  }

  /**
   * 清理过期缓存
   */
  cleanupExpiredCache() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [userId, user] of this.userCache.entries()) {
      if (now - user.cacheTime > this.config.cacheTTL) {
        this.userCache.delete(userId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 已清理 ${cleanedCount} 个过期缓存条目`);
    }
  }

  /**
   * 清理最旧的缓存条目
   */
  cleanupOldestCache() {
    let oldestTime = Date.now();
    let oldestUserId = null;

    for (const [userId, user] of this.userCache.entries()) {
      if (user.cacheTime < oldestTime) {
        oldestTime = user.cacheTime;
        oldestUserId = userId;
      }
    }

    if (oldestUserId) {
      this.userCache.delete(oldestUserId);
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      userCacheSize: this.userCache.size,
      portMappingSize: this.portUserMapping.size,
      cacheType: 'simplified',
      syncInterval: this.config.syncInterval,
      cacheTTL: this.config.cacheTTL,
      hitRate: this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) || 0
    };
  }

  /**
   * 停止所有定时器
   */
  stop() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    console.log('✅ 简化缓存服务已停止');
  }
}

module.exports = new SimplifiedCacheService();
