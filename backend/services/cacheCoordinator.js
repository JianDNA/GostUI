/**
 * 🚀 缓存协调器 - 统一管理所有缓存的同步和清理
 * 
 * 功能:
 * 1. 统一的缓存同步机制
 * 2. 主动缓存清理 (用户编辑时)
 * 3. 30秒纠错同步
 * 4. 缓存一致性检查
 * 5. 性能监控和统计
 */

class CacheCoordinator {
  constructor() {
    this.config = {
      syncInterval: 30 * 1000,        // 30秒同步一次
      healthCheckInterval: 60 * 1000, // 60秒健康检查
      maxSyncRetries: 3,              // 最大重试次数
      syncTimeout: 10 * 1000          // 同步超时时间
    };
    
    this.stats = {
      syncCount: 0,
      errorCount: 0,
      lastSyncTime: null,
      lastErrorTime: null,
      cacheHitRate: 0
    };
    
    this.syncTimer = null;
    this.healthCheckTimer = null;
    this.isInitialized = false;
    
    console.log('🎯 [缓存协调器] 初始化');
  }

  /**
   * 初始化缓存协调器
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('⚠️ [缓存协调器] 已经初始化，跳过');
      return;
    }

    try {
      // 启动同步定时器
      this.startSyncTimer();
      
      // 启动健康检查定时器
      this.startHealthCheckTimer();
      
      // 立即执行一次同步
      await this.performFullSync();
      
      this.isInitialized = true;
      console.log('✅ [缓存协调器] 初始化完成');
    } catch (error) {
      console.error('❌ [缓存协调器] 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 启动同步定时器
   */
  startSyncTimer() {
    this.syncTimer = setInterval(async () => {
      await this.performFullSync();
    }, this.config.syncInterval);
    
    console.log(`⏰ [缓存协调器] 同步定时器已启动，间隔: ${this.config.syncInterval / 1000}秒`);
  }

  /**
   * 启动健康检查定时器
   */
  startHealthCheckTimer() {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval);
    
    console.log(`⏰ [缓存协调器] 健康检查定时器已启动，间隔: ${this.config.healthCheckInterval / 1000}秒`);
  }

  /**
   * 执行完整同步
   */
  async performFullSync() {
    const startTime = Date.now();
    
    try {
      console.log('🔄 [缓存协调器] 开始完整同步...');
      
      // 1. 同步多实例缓存
      const multiInstanceCacheService = require('./multiInstanceCacheService');
      await multiInstanceCacheService.syncCache();
      
      // 2. 同步认证器缓存
      const gostAuthService = require('./gostAuthService');
      await gostAuthService.syncWithMultiInstanceCache();
      
      // 3. 同步限制器缓存 (如果存在)
      try {
        const gostLimiterService = require('./gostLimiterService');
        if (gostLimiterService.syncWithCache) {
          await gostLimiterService.syncWithCache();
        }
      } catch (error) {
        // 限制器服务可能不存在，忽略错误
      }
      
      // 4. 同步简化缓存服务 (如果存在)
      try {
        const simplifiedCacheService = require('./simplifiedCacheService');
        await simplifiedCacheService.syncCache();
      } catch (error) {
        // 简化缓存服务可能不存在，忽略错误
      }
      
      // 更新统计信息
      this.stats.syncCount++;
      this.stats.lastSyncTime = new Date();
      
      const duration = Date.now() - startTime;
      console.log(`✅ [缓存协调器] 完整同步完成，耗时: ${duration}ms`);
      
    } catch (error) {
      this.stats.errorCount++;
      this.stats.lastErrorTime = new Date();
      console.error('❌ [缓存协调器] 完整同步失败:', error);
    }
  }

  /**
   * 执行健康检查
   */
  async performHealthCheck() {
    try {
      console.log('🏥 [缓存协调器] 开始健康检查...');
      
      const healthReport = {
        multiInstanceCache: await this.checkMultiInstanceCacheHealth(),
        authCache: await this.checkAuthCacheHealth(),
        overall: 'healthy'
      };
      
      // 检查整体健康状态
      const unhealthyServices = Object.entries(healthReport)
        .filter(([key, value]) => key !== 'overall' && value.status !== 'healthy')
        .map(([key]) => key);
      
      if (unhealthyServices.length > 0) {
        healthReport.overall = 'unhealthy';
        console.warn(`⚠️ [缓存协调器] 发现不健康的缓存服务: ${unhealthyServices.join(', ')}`);
        
        // 尝试修复
        await this.performRepairActions(unhealthyServices);
      } else {
        console.log('✅ [缓存协调器] 所有缓存服务健康');
      }
      
    } catch (error) {
      console.error('❌ [缓存协调器] 健康检查失败:', error);
    }
  }

  /**
   * 检查多实例缓存健康状态
   */
  async checkMultiInstanceCacheHealth() {
    try {
      const multiInstanceCacheService = require('./multiInstanceCacheService');
      const stats = multiInstanceCacheService.getStats();
      
      return {
        status: 'healthy',
        cacheSize: stats.userCacheSize || 0,
        portMappingSize: stats.portMappingSize || 0,
        hitRate: stats.hitRate || 0
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  /**
   * 检查认证器缓存健康状态
   */
  async checkAuthCacheHealth() {
    try {
      const gostAuthService = require('./gostAuthService');
      const stats = gostAuthService.getAuthStats();
      
      return {
        status: 'healthy',
        portMappingCacheSize: stats.portMappingCacheSize || 0,
        userDataCacheSize: stats.userDataCacheSize || 0,
        authResultCacheSize: stats.authResultCacheSize || 0,
        cacheHitRate: stats.cacheHitRate || '0%'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  /**
   * 执行修复操作
   */
  async performRepairActions(unhealthyServices) {
    console.log(`🔧 [缓存协调器] 开始修复不健康的服务: ${unhealthyServices.join(', ')}`);
    
    for (const service of unhealthyServices) {
      try {
        switch (service) {
          case 'multiInstanceCache':
            const multiInstanceCacheService = require('./multiInstanceCacheService');
            await multiInstanceCacheService.syncCache();
            console.log(`✅ [缓存协调器] 修复多实例缓存成功`);
            break;
            
          case 'authCache':
            const gostAuthService = require('./gostAuthService');
            await gostAuthService.refreshCache();
            console.log(`✅ [缓存协调器] 修复认证器缓存成功`);
            break;
        }
      } catch (error) {
        console.error(`❌ [缓存协调器] 修复 ${service} 失败:`, error);
      }
    }
  }

  /**
   * 🚀 主动清理缓存 (用户编辑操作时调用)
   */
  async clearUserRelatedCache(userId, operation = 'unknown') {
    console.log(`🧹 [缓存协调器] 清理用户 ${userId} 相关缓存，操作: ${operation}`);
    
    try {
      // 1. 清理多实例缓存
      const multiInstanceCacheService = require('./multiInstanceCacheService');
      multiInstanceCacheService.clearUserCache(userId);
      
      // 2. 清理认证器缓存
      const gostAuthService = require('./gostAuthService');
      gostAuthService.clearUserCache(userId);
      
      // 3. 清理限制器缓存
      try {
        const gostLimiterService = require('./gostLimiterService');
        if (gostLimiterService.clearUserQuotaCache) {
          gostLimiterService.clearUserQuotaCache(userId);
        }
      } catch (error) {
        // 限制器服务可能不存在，忽略错误
      }
      
      // 4. 清理简化配额服务缓存
      try {
        const simplifiedQuotaService = require('./simplifiedQuotaService');
        if (simplifiedQuotaService.clearUserCache) {
          simplifiedQuotaService.clearUserCache(userId);
        }
      } catch (error) {
        // 简化配额服务可能不存在，忽略错误
      }
      
      console.log(`✅ [缓存协调器] 用户 ${userId} 相关缓存清理完成`);
      
    } catch (error) {
      console.error(`❌ [缓存协调器] 清理用户 ${userId} 缓存失败:`, error);
    }
  }

  /**
   * 🚀 主动清理端口相关缓存 (规则编辑操作时调用)
   */
  async clearPortRelatedCache(port, operation = 'unknown') {
    console.log(`🧹 [缓存协调器] 清理端口 ${port} 相关缓存，操作: ${operation}`);
    
    try {
      // 1. 清理认证器端口缓存
      const gostAuthService = require('./gostAuthService');
      gostAuthService.clearPortCache(port);
      
      // 2. 刷新端口用户映射
      const multiInstanceCacheService = require('./multiInstanceCacheService');
      await multiInstanceCacheService.refreshPortUserMapping();
      
      console.log(`✅ [缓存协调器] 端口 ${port} 相关缓存清理完成`);
      
    } catch (error) {
      console.error(`❌ [缓存协调器] 清理端口 ${port} 缓存失败:`, error);
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      isInitialized: this.isInitialized,
      syncInterval: this.config.syncInterval,
      healthCheckInterval: this.config.healthCheckInterval
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
    
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    this.isInitialized = false;
    console.log('✅ [缓存协调器] 已停止');
  }
}

module.exports = new CacheCoordinator();
