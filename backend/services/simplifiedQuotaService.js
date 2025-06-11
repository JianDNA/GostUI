/**
 * 简化的配额服务
 * 
 * 设计理念：
 * 1. 减少处理频率限制，提高响应速度
 * 2. 简化日志输出，减少噪音
 * 3. 保留核心功能：配额检查、状态缓存
 * 4. 优化性能，减少锁机制复杂性
 */

const { User } = require('../models');

class SimplifiedQuotaService {
  constructor() {
    // 简化的配置
    this.config = {
      minProcessInterval: 2000,    // 2秒最小间隔（减少限制）
      cacheTimeout: 30000,         // 30秒缓存超时
      maxCacheSize: 500            // 最大缓存条目数
    };
    
    // 状态管理
    this.quotaCache = new Map();
    this.lastProcessTime = new Map();
    this.isProcessing = new Set();
    
    // 统计信息
    this.stats = {
      checksPerformed: 0,
      cacheHits: 0,
      cacheMisses: 0,
      quotaViolations: 0
    };
    
    console.log('🎯 简化配额服务已初始化');
  }

  /**
   * 检查用户配额
   */
  async checkUserQuota(userId, trigger = 'unknown', force = false) {
    const now = Date.now();
    const cacheKey = `user_${userId}`;
    
    try {
      // 检查是否正在处理
      if (this.isProcessing.has(userId) && !force) {
        return this.getCachedResult(userId) || { allowed: true, reason: 'processing' };
      }

      // 检查处理间隔（简化）
      const lastTime = this.lastProcessTime.get(userId);
      if (lastTime && (now - lastTime) < this.config.minProcessInterval && !force) {
        return this.getCachedResult(userId) || { allowed: true, reason: 'interval_not_reached' };
      }

      // 设置处理状态
      this.isProcessing.add(userId);
      this.lastProcessTime.set(userId, now);
      this.stats.checksPerformed++;

      // 执行配额检查
      const result = await this.performQuotaCheck(userId, trigger);

      // 缓存结果
      this.setCachedResult(userId, result);

      // 只在重要情况下输出日志
      if (!result.allowed || trigger === 'force_refresh') {
        console.log(`🎯 用户 ${userId} 配额检查: ${result.allowed ? '允许' : '禁止'} (${result.reason})`);
      }

      return result;

    } catch (error) {
      console.error(`❌ 用户 ${userId} 配额检查失败:`, error);
      return { allowed: true, reason: 'check_failed', error: error.message };
    } finally {
      // 释放处理状态
      this.isProcessing.delete(userId);
    }
  }

  /**
   * 执行实际的配额检查
   */
  async performQuotaCheck(userId, trigger) {
    try {
      // 获取用户信息（减少查询字段）
      const user = await User.findByPk(userId, {
        attributes: ['id', 'username', 'role', 'trafficQuota', 'usedTraffic', 'expiryDate']
      });

      if (!user) {
        return { allowed: false, reason: 'user_not_found' };
      }

      // 检查用户过期状态
      if (user.role !== 'admin' && user.expiryDate && new Date(user.expiryDate) <= new Date()) {
        return { 
          allowed: false, 
          reason: 'user_expired',
          needsRuleUpdate: true
        };
      }

      // Admin用户不受配额限制
      if (user.role === 'admin') {
        return { 
          allowed: true, 
          reason: 'admin_unlimited',
          needsRuleUpdate: false
        };
      }

      // 检查流量配额
      const trafficQuota = user.trafficQuota;
      const usedTraffic = user.usedTraffic || 0;

      if (!trafficQuota || trafficQuota <= 0) {
        return { 
          allowed: true, 
          reason: 'no_quota_limit',
          needsRuleUpdate: false
        };
      }

      const quotaBytes = trafficQuota * 1024 * 1024 * 1024;
      const usagePercentage = (usedTraffic / quotaBytes) * 100;

      if (usedTraffic >= quotaBytes) {
        this.stats.quotaViolations++;
        return {
          allowed: false,
          reason: `quota_exceeded: ${usagePercentage.toFixed(1)}% (${this.formatBytes(usedTraffic)}/${this.formatBytes(quotaBytes)})`,
          needsRuleUpdate: true,
          usagePercentage: usagePercentage,
          usedTraffic: usedTraffic,
          quotaBytes: quotaBytes
        };
      }

      return {
        allowed: true,
        reason: `quota_ok: ${usagePercentage.toFixed(1)}% (${this.formatBytes(usedTraffic)}/${this.formatBytes(quotaBytes)})`,
        needsRuleUpdate: false,
        usagePercentage: usagePercentage,
        usedTraffic: usedTraffic,
        quotaBytes: quotaBytes
      };

    } catch (error) {
      console.error(`❌ 执行配额检查失败:`, error);
      return { allowed: true, reason: 'check_error', error: error.message };
    }
  }

  /**
   * 获取缓存结果
   */
  getCachedResult(userId) {
    const cached = this.quotaCache.get(userId);
    
    if (!cached) {
      this.stats.cacheMisses++;
      return null;
    }

    // 检查缓存是否过期
    if (Date.now() - cached.timestamp > this.config.cacheTimeout) {
      this.quotaCache.delete(userId);
      this.stats.cacheMisses++;
      return null;
    }

    this.stats.cacheHits++;
    return cached.result;
  }

  /**
   * 设置缓存结果
   */
  setCachedResult(userId, result) {
    // 检查缓存大小限制
    if (this.quotaCache.size >= this.config.maxCacheSize) {
      this.cleanupOldestCache();
    }

    this.quotaCache.set(userId, {
      result: result,
      timestamp: Date.now()
    });
  }

  /**
   * 强制刷新用户配额状态
   */
  async forceRefreshUser(userId, trigger = 'force_refresh') {
    // 清除缓存
    this.quotaCache.delete(userId);
    this.lastProcessTime.delete(userId);
    
    // 强制检查
    return await this.checkUserQuota(userId, trigger, true);
  }

  /**
   * 清除用户缓存
   */
  clearUserCache(userId) {
    this.quotaCache.delete(userId);
    this.lastProcessTime.delete(userId);
  }

  /**
   * 清理最旧的缓存条目
   */
  cleanupOldestCache() {
    let oldestTime = Date.now();
    let oldestUserId = null;

    for (const [userId, cached] of this.quotaCache.entries()) {
      if (cached.timestamp < oldestTime) {
        oldestTime = cached.timestamp;
        oldestUserId = userId;
      }
    }

    if (oldestUserId) {
      this.quotaCache.delete(oldestUserId);
    }
  }

  /**
   * 清理过期缓存
   */
  cleanupExpiredCache() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [userId, cached] of this.quotaCache.entries()) {
      if (now - cached.timestamp > this.config.cacheTimeout) {
        this.quotaCache.delete(userId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 已清理 ${cleanedCount} 个过期配额缓存`);
    }
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    return {
      config: this.config,
      stats: {
        ...this.stats,
        cacheSize: this.quotaCache.size,
        processingUsers: this.isProcessing.size,
        hitRate: this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) || 0
      }
    };
  }

  /**
   * 格式化字节数
   */
  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
  }
}

module.exports = new SimplifiedQuotaService();
