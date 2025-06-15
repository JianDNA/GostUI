/**
 * GOST认证器插件服务
 * 为GOST提供用户身份标识，配合限制器使用
 */

const { User, UserForwardRule } = require('../models');
const multiInstanceCacheService = require('./multiInstanceCacheService');

class GostAuthService {
  constructor() {
    // 🚀 优化1: 多层缓存架构
    this.portMappingCache = new Map(); // 端口映射缓存
    this.userDataCache = new Map();    // 用户数据缓存
    this.authResultCache = new Map();  // 认证结果缓存

    // 🚀 优化2: 从配置管理器获取缓存时间
    this.updateCacheConfig();

    // 🚀 优化3: 预热缓存配置
    this.preloadConfig = {
      enabled: true,
      interval: 10 * 60 * 1000,    // 10分钟预热一次
      maxPreloadUsers: 100         // 最多预热100个用户
    };

    // 🚀 优化4: 性能监控
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      dbQueries: 0,
      avgResponseTime: 0
    };

    // 启动预热和清理定时器
    this.startPreloadTimer();
    this.startCleanupTimer();

    console.log('🚀 [认证器] 高性能缓存系统已启动');
  }

  /**
   * 🚀 新增: 更新缓存配置
   */
  updateCacheConfig() {
    try {
      const performanceConfigManager = require('./performanceConfigManager');
      const cacheConfig = performanceConfigManager.getCacheConfig();

      this.cacheExpiry = {
        portMapping: 5 * 60 * 1000,  // 5分钟 (端口映射很少变化)
        userData: 3 * 60 * 1000,     // 3分钟 (用户数据偶尔变化)
        authResult: cacheConfig.authCacheTimeout || (2 * 60 * 1000)  // 从配置获取
      };

      console.log(`🔧 [认证器] 缓存配置已更新: 认证结果缓存${this.cacheExpiry.authResult / 1000}秒`);
    } catch (error) {
      console.warn('⚠️ [认证器] 更新缓存配置失败，使用默认值:', error.message);
      this.cacheExpiry = {
        portMapping: 5 * 60 * 1000,
        userData: 3 * 60 * 1000,
        authResult: 2 * 60 * 1000
      };
    }
  }

  /**
   * 🚀 优化版: 处理GOST认证请求 (高性能缓存版本)
   * @param {Object} request - GOST认证请求
   * @returns {Object} 认证响应
   */
  async handleAuthRequest(request) {
    const startTime = Date.now();

    try {
      const { service, network, addr, src } = request;

      // 🚀 优化: 先检查认证结果缓存
      const authCacheKey = `auth:${service}`;
      const cachedAuth = this.authResultCache.get(authCacheKey);
      if (cachedAuth && Date.now() - cachedAuth.timestamp < this.cacheExpiry.authResult) {
        this.stats.cacheHits++;
        console.log(`⚡ [认证器] 使用认证结果缓存: ${service}`);
        return cachedAuth.result;
      }

      console.log(`🔐 [认证器] 收到认证请求:`, {
        service,
        network,
        addr,
        src: src?.substring(0, 20) + '...'
      });

      // 🚀 优化: 使用高性能端口解析
      const userInfo = await this.parseUserFromServiceOptimized(service);

      if (!userInfo) {
        console.log(`⚠️ [认证器] 无法解析用户信息，拒绝认证`);
        const result = { ok: false, id: '', secret: '' };
        // 缓存失败结果 (短时间缓存，避免重复查询)
        this.authResultCache.set(authCacheKey, {
          result,
          timestamp: Date.now()
        });
        return result;
      }

      // 🚀 优化: 使用高性能用户数据获取
      const user = await this.getUserByIdOptimized(userInfo.userId);
      if (!user) {
        console.log(`❌ [认证器] 用户 ${userInfo.userId} 不存在`);
        const result = { ok: false, id: '', secret: '' };
        this.authResultCache.set(authCacheKey, { result, timestamp: Date.now() });
        return result;
      }

      if (!user.isActive || user.userStatus !== 'active') {
        console.log(`❌ [认证器] 用户 ${user.username} 状态异常: ${user.userStatus}, active: ${user.isActive}`);
        const result = { ok: false, id: '', secret: '' };
        this.authResultCache.set(authCacheKey, { result, timestamp: Date.now() });
        return result;
      }

      // 🔧 新增：检查流量限制（管理员除外）
      if (user.role !== 'admin') {
        const trafficQuota = user.trafficQuota || 0; // GB
        const usedTraffic = user.usedTraffic || 0;   // bytes

        if (trafficQuota > 0) {
          const quotaBytes = trafficQuota * 1024 * 1024 * 1024; // 转换为字节
          if (usedTraffic >= quotaBytes) {
            console.log(`🚫 [认证器] 用户 ${user.username} 流量超限: ${(usedTraffic / 1024 / 1024 / 1024).toFixed(2)}GB/${trafficQuota}GB，拒绝连接`);
            const result = { ok: false, id: '', secret: '' };
            this.authResultCache.set(authCacheKey, { result, timestamp: Date.now() });
            return result;
          }
        }
      }

      // 认证成功，返回用户标识
      const clientId = `user_${user.id}`;
      console.log(`✅ [认证器] 用户 ${user.username} 认证成功，客户端ID: ${clientId}`);

      const result = {
        ok: true,
        id: clientId,           // 用户标识，传递给限制器
        secret: 'authenticated' // 认证令牌
      };

      // 🚀 优化: 缓存成功的认证结果
      this.authResultCache.set(authCacheKey, { result, timestamp: Date.now() });

      return result;

    } catch (error) {
      console.error(`❌ [认证器] 处理认证请求失败:`, error);
      this.stats.dbQueries++; // 记录错误
      return { ok: false, id: '', secret: '' };
    } finally {
      // 🚀 优化: 性能监控
      const responseTime = Date.now() - startTime;
      this.updatePerformanceStats(responseTime);
    }
  }

  /**
   * 🚀 优化版: 从服务名解析用户信息 (高性能版本)
   * @param {string} service - 服务名
   * @returns {Object|null} 用户信息
   */
  async parseUserFromServiceOptimized(service) {
    try {
      if (!service) {
        return null;
      }

      // 从服务名中提取端口号
      const portMatch = service.match(/forward-\w+-(\d+)/);
      if (!portMatch) {
        console.log(`⚠️ [认证器] 无法从服务名 ${service} 中提取端口号`);
        return null;
      }

      const port = parseInt(portMatch[1]);

      // 🚀 优化: 检查端口映射缓存
      const cacheKey = `port_${port}`;
      const cached = this.portMappingCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry.portMapping) {
        this.stats.cacheHits++;
        return cached.data;
      }

      // 🚀 优化: 获取端口用户映射 (使用多实例缓存，避免数据库查询)
      const userMapping = multiInstanceCacheService.getPortUserMapping();

      if (!userMapping[port]) {
        console.log(`⚠️ [认证器] 端口 ${port} 没有对应的用户映射`);
        // 缓存空结果，避免重复查询
        this.portMappingCache.set(cacheKey, {
          data: null,
          timestamp: Date.now()
        });
        this.stats.cacheMisses++;
        return null;
      }

      const userInfo = userMapping[port];

      // 🚀 优化: 缓存结果 (使用更长的缓存时间)
      this.portMappingCache.set(cacheKey, {
        data: userInfo,
        timestamp: Date.now()
      });

      this.stats.cacheMisses++;
      console.log(`🔍 [认证器] 端口 ${port} 映射到用户: ${userInfo.username} (ID: ${userInfo.userId})`);
      return userInfo;

    } catch (error) {
      console.error(`❌ [认证器] 解析用户信息失败:`, error);
      this.stats.dbQueries++;
      return null;
    }
  }

  /**
   * 🚀 优化版: 获取用户信息 (高性能缓存版本)
   * @param {number} userId - 用户ID
   * @returns {Object|null} 用户信息
   */
  async getUserByIdOptimized(userId) {
    try {
      // 🚀 优化: 先检查用户数据缓存
      const cacheKey = `user_${userId}`;
      const cached = this.userDataCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry.userData) {
        this.stats.cacheHits++;
        return cached.data;
      }

      // 🚀 优化: 尝试从多实例缓存获取 (避免数据库查询)
      const cachedUser = multiInstanceCacheService.getUserCache(userId);
      if (cachedUser) {
        // 转换为认证器需要的格式
        const userData = {
          id: cachedUser.id,
          username: cachedUser.username,
          role: cachedUser.role,
          isActive: cachedUser.isActive,
          userStatus: cachedUser.status,
          trafficQuota: cachedUser.trafficQuota,
          usedTraffic: cachedUser.usedTraffic
        };

        // 缓存到本地
        this.userDataCache.set(cacheKey, {
          data: userData,
          timestamp: Date.now()
        });

        this.stats.cacheHits++;
        return userData;
      }

      // 🚀 优化: 最后才查询数据库 (并优化查询字段)
      console.log(`🔍 [认证器] 从数据库查询用户 ${userId}`);
      const user = await User.findByPk(userId, {
        attributes: ['id', 'username', 'role', 'isActive', 'userStatus', 'trafficQuota', 'usedTraffic', 'additionalPorts', 'portRangeStart', 'portRangeEnd']
      });

      this.stats.dbQueries++;
      this.stats.cacheMisses++;

      if (user) {
        // 🚀 优化: 缓存数据库查询结果
        const userData = user.toJSON();
        this.userDataCache.set(cacheKey, {
          data: userData,
          timestamp: Date.now()
        });
        return userData;
      }

      return null;
    } catch (error) {
      console.error(`❌ [认证器] 获取用户信息失败:`, error);
      this.stats.dbQueries++;
      return null;
    }
  }

  /**
   * 🚀 优化版: 清除端口映射缓存
   * @param {number} port - 端口号
   */
  clearPortCache(port) {
    const cacheKey = `port_${port}`;
    this.portMappingCache.delete(cacheKey);

    // 清除相关的认证结果缓存
    const authCacheKey = `auth:forward-tcp-${port}`;
    this.authResultCache.delete(authCacheKey);

    console.log(`🧹 [认证器] 清除端口 ${port} 相关缓存`);
  }

  /**
   * 🚀 优化版: 清除用户相关缓存
   * @param {number} userId - 用户ID
   */
  clearUserCache(userId) {
    const userCacheKey = `user_${userId}`;
    this.userDataCache.delete(userCacheKey);

    // 清除相关的认证结果缓存
    for (const [key, cached] of this.authResultCache.entries()) {
      if (cached.result && cached.result.id === `user_${userId}`) {
        this.authResultCache.delete(key);
      }
    }

    console.log(`🧹 [认证器] 清除用户 ${userId} 相关缓存`);
  }

  /**
   * 🚀 优化版: 清除所有缓存
   */
  clearAllCache() {
    this.portMappingCache.clear();
    this.userDataCache.clear();
    this.authResultCache.clear();

    // 重置统计信息
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      dbQueries: 0,
      avgResponseTime: 0
    };

    console.log(`🧹 [认证器] 清除所有缓存`);
  }

  /**
   * 🚀 新增: 与多实例缓存同步 (纠错机制)
   */
  async syncWithMultiInstanceCache() {
    try {
      const multiInstanceCacheService = require('./multiInstanceCacheService');

      // 获取最新的端口映射
      const latestPortMapping = multiInstanceCacheService.getPortUserMapping();
      let syncedPorts = 0;
      let syncedUsers = 0;

      // 同步端口映射缓存
      for (const [port, userInfo] of Object.entries(latestPortMapping)) {
        const cacheKey = `port_${port}`;
        const cached = this.portMappingCache.get(cacheKey);

        // 如果缓存不存在或数据不一致，则更新
        if (!cached ||
            cached.data?.userId !== userInfo.userId ||
            cached.data?.username !== userInfo.username) {

          this.portMappingCache.set(cacheKey, {
            data: userInfo,
            timestamp: Date.now()
          });
          syncedPorts++;

          // 同时清理相关的认证结果缓存
          const authCacheKey = `auth:forward-tcp-${port}`;
          this.authResultCache.delete(authCacheKey);
        }

        // 同步用户数据缓存
        const cachedUser = multiInstanceCacheService.getUserCache(userInfo.userId);
        if (cachedUser) {
          const userCacheKey = `user_${userInfo.userId}`;
          const existingUserCache = this.userDataCache.get(userCacheKey);

          // 检查用户数据是否需要更新
          if (!existingUserCache ||
              existingUserCache.data?.userStatus !== cachedUser.status ||
              existingUserCache.data?.trafficQuota !== cachedUser.trafficQuota ||
              existingUserCache.data?.usedTraffic !== cachedUser.usedTraffic) {

            const userData = {
              id: cachedUser.id,
              username: cachedUser.username,
              role: cachedUser.role,
              isActive: cachedUser.isActive,
              userStatus: cachedUser.status,
              trafficQuota: cachedUser.trafficQuota,
              usedTraffic: cachedUser.usedTraffic
            };

            this.userDataCache.set(userCacheKey, {
              data: userData,
              timestamp: Date.now()
            });
            syncedUsers++;

            // 清理相关的认证结果缓存
            for (const [key, cached] of this.authResultCache.entries()) {
              if (cached.result && cached.result.id === `user_${userInfo.userId}`) {
                this.authResultCache.delete(key);
              }
            }
          }
        }
      }

      if (syncedPorts > 0 || syncedUsers > 0) {
        console.log(`🔄 [认证器] 缓存同步完成: ${syncedPorts}个端口, ${syncedUsers}个用户`);
      }

    } catch (error) {
      console.error('❌ [认证器] 缓存同步失败:', error);
    }
  }

  /**
   * 🚀 新增: 强制刷新缓存
   */
  async refreshCache() {
    console.log('🔄 [认证器] 强制刷新缓存...');
    this.clearAllCache();
    await this.preloadCache();
    await this.syncWithMultiInstanceCache();
    console.log('✅ [认证器] 缓存刷新完成');
  }

  /**
   * 保持兼容性: 原有方法的别名
   */
  async parseUserFromService(service) {
    return await this.parseUserFromServiceOptimized(service);
  }

  async getUserById(userId) {
    return await this.getUserByIdOptimized(userId);
  }

  /**
   * 验证用户凭据（用于基本认证）
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @returns {Object} 验证结果
   */
  async validateCredentials(username, password) {
    try {
      // 这里可以实现真正的用户名密码验证
      // 目前简化处理，主要依赖端口映射
      const user = await User.findOne({
        where: { username },
        attributes: ['id', 'username', 'role', 'isActive', 'userStatus', 'additionalPorts', 'portRangeStart', 'portRangeEnd']
      });

      if (!user) {
        return { valid: false, reason: 'User not found' };
      }

      if (!user.isActive || user.userStatus !== 'active') {
        return { valid: false, reason: 'User inactive' };
      }

      // 简化的密码验证（实际应该使用加密密码）
      // 这里主要用于演示，实际部署时应该实现真正的密码验证
      return {
        valid: true,
        userId: user.id,
        username: user.username,
        role: user.role
      };

    } catch (error) {
      console.error(`❌ [认证器] 验证用户凭据失败:`, error);
      return { valid: false, reason: 'Validation error' };
    }
  }

  /**
   * 🚀 新增: 预热缓存系统
   */
  async preloadCache() {
    try {
      console.log('🔥 [认证器] 开始预热缓存...');

      // 预热端口映射缓存
      const portMapping = multiInstanceCacheService.getPortUserMapping();
      let preloadedPorts = 0;

      for (const [port, userInfo] of Object.entries(portMapping)) {
        const cacheKey = `port_${port}`;
        this.portMappingCache.set(cacheKey, {
          data: userInfo,
          timestamp: Date.now()
        });
        preloadedPorts++;

        // 预热用户数据缓存
        if (preloadedPorts <= this.preloadConfig.maxPreloadUsers) {
          const cachedUser = multiInstanceCacheService.getUserCache(userInfo.userId);
          if (cachedUser) {
            const userCacheKey = `user_${userInfo.userId}`;
            const userData = {
              id: cachedUser.id,
              username: cachedUser.username,
              role: cachedUser.role,
              isActive: cachedUser.isActive,
              userStatus: cachedUser.status,
              trafficQuota: cachedUser.trafficQuota,
              usedTraffic: cachedUser.usedTraffic
            };

            this.userDataCache.set(userCacheKey, {
              data: userData,
              timestamp: Date.now()
            });
          }
        }
      }

      console.log(`✅ [认证器] 缓存预热完成: ${preloadedPorts} 个端口映射, ${this.userDataCache.size} 个用户数据`);
    } catch (error) {
      console.error('❌ [认证器] 缓存预热失败:', error);
    }
  }

  /**
   * 🚀 新增: 启动预热定时器
   */
  startPreloadTimer() {
    if (!this.preloadConfig.enabled) return;

    // 立即执行一次预热
    setTimeout(() => this.preloadCache(), 5000);

    // 定期预热
    setInterval(() => {
      this.preloadCache();
    }, this.preloadConfig.interval);

    // 🚀 新增: 30秒同步纠错机制
    setInterval(() => {
      this.syncWithMultiInstanceCache();
    }, 30 * 1000);

    console.log(`⏰ [认证器] 缓存预热定时器已启动，间隔: ${this.preloadConfig.interval / 1000 / 60} 分钟`);
    console.log(`⏰ [认证器] 缓存同步纠错定时器已启动，间隔: 30秒`);
  }

  /**
   * 🚀 新增: 启动清理定时器
   */
  startCleanupTimer() {
    setInterval(() => {
      this.cleanupExpiredCache();
    }, 2 * 60 * 1000); // 每2分钟清理一次

    console.log('⏰ [认证器] 缓存清理定时器已启动');
  }

  /**
   * 🚀 新增: 清理过期缓存
   */
  cleanupExpiredCache() {
    const now = Date.now();
    let cleanedCount = 0;

    // 清理端口映射缓存
    for (const [key, cached] of this.portMappingCache.entries()) {
      if (now - cached.timestamp > this.cacheExpiry.portMapping) {
        this.portMappingCache.delete(key);
        cleanedCount++;
      }
    }

    // 清理用户数据缓存
    for (const [key, cached] of this.userDataCache.entries()) {
      if (now - cached.timestamp > this.cacheExpiry.userData) {
        this.userDataCache.delete(key);
        cleanedCount++;
      }
    }

    // 清理认证结果缓存
    for (const [key, cached] of this.authResultCache.entries()) {
      if (now - cached.timestamp > this.cacheExpiry.authResult) {
        this.authResultCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 [认证器] 已清理 ${cleanedCount} 个过期缓存条目`);
    }
  }

  /**
   * 🚀 新增: 更新性能统计
   */
  updatePerformanceStats(responseTime) {
    // 计算平均响应时间 (简单移动平均)
    this.stats.avgResponseTime = (this.stats.avgResponseTime * 0.9) + (responseTime * 0.1);
  }

  /**
   * 🚀 优化版: 获取认证统计信息
   * @returns {Object} 统计信息
   */
  getAuthStats() {
    const totalRequests = this.stats.cacheHits + this.stats.cacheMisses;
    const cacheHitRate = totalRequests > 0 ? (this.stats.cacheHits / totalRequests * 100).toFixed(2) : 0;

    return {
      // 缓存大小
      portMappingCacheSize: this.portMappingCache.size,
      userDataCacheSize: this.userDataCache.size,
      authResultCacheSize: this.authResultCache.size,

      // 缓存配置
      cacheExpiry: this.cacheExpiry,

      // 性能统计
      cacheHits: this.stats.cacheHits,
      cacheMisses: this.stats.cacheMisses,
      cacheHitRate: `${cacheHitRate}%`,
      dbQueries: this.stats.dbQueries,
      avgResponseTime: `${this.stats.avgResponseTime.toFixed(2)}ms`,

      // 预热配置
      preloadEnabled: this.preloadConfig.enabled,
      preloadInterval: `${this.preloadConfig.interval / 1000 / 60} 分钟`,

      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new GostAuthService();
