/**
 * 简化的配置同步服务
 * 
 * 设计理念：
 * 1. 减少同步频率，避免过度同步
 * 2. 简化队列机制，减少复杂性
 * 3. 保留核心功能：配置生成、GOST更新
 * 4. 优化性能，减少锁机制开销
 */

const crypto = require('crypto');

class SimplifiedSyncService {
  constructor() {
    // 简化的配置
    this.config = {
      minSyncInterval: 5000,      // 5秒最小间隔（减少限制）
      maxQueueSize: 3,            // 最大队列3个（减少队列）
      syncTimeout: 15000,         // 15秒超时（减少等待）
      autoSyncInterval: 120000    // 2分钟自动同步（减少频率）
    };
    
    // 状态管理
    this.isSyncing = false;
    this.syncQueue = [];
    this.lastSyncTime = null;
    this.lastConfigHash = null;
    this.autoSyncTimer = null;
    
    // 统计信息
    this.stats = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      skippedSyncs: 0
    };
    
    console.log('🔧 简化同步服务已初始化');
  }

  /**
   * 请求同步
   */
  async requestSync(trigger = 'unknown', force = false, priority = 5) {
    const request = {
      id: this.generateRequestId(),
      trigger,
      force,
      priority,
      timestamp: Date.now()
    };

    try {
      // 检查是否需要跳过
      if (!force && this.shouldSkipSync(trigger)) {
        this.stats.skippedSyncs++;
        return { skipped: true, reason: 'interval_not_reached' };
      }

      // 如果当前没有同步进行，立即执行
      if (!this.isSyncing) {
        return await this.executeSync(request);
      }

      // 简化的队列处理
      return await this.enqueueSync(request);

    } catch (error) {
      console.error(`❌ 同步请求失败: ${request.id}`, error);
      this.stats.failedSyncs++;
      return { success: false, error: error.message };
    }
  }

  /**
   * 检查是否应该跳过同步
   */
  shouldSkipSync(trigger) {
    // 强制触发源不跳过
    if (['manual', 'force', 'admin'].includes(trigger)) {
      return false;
    }

    // 检查时间间隔
    if (this.lastSyncTime) {
      const timeSinceLastSync = Date.now() - this.lastSyncTime;
      if (timeSinceLastSync < this.config.minSyncInterval) {
        return true;
      }
    }

    return false;
  }

  /**
   * 简化的队列处理
   */
  async enqueueSync(request) {
    // 检查队列大小
    if (this.syncQueue.length >= this.config.maxQueueSize) {
      // 移除最旧的请求
      const removed = this.syncQueue.shift();
      console.log(`🗑️ 队列已满，移除请求: ${removed.id}`);
    }

    // 检查是否有相同触发源的请求
    const existingIndex = this.syncQueue.findIndex(req => req.trigger === request.trigger);
    if (existingIndex !== -1) {
      // 替换现有请求
      this.syncQueue[existingIndex] = request;
      console.log(`🔄 替换队列中的请求: ${request.id}`);
    } else {
      // 添加到队列
      this.syncQueue.push(request);
    }

    return { queued: true, queueLength: this.syncQueue.length };
  }

  /**
   * 执行同步
   */
  async executeSync(request) {
    if (this.isSyncing) {
      throw new Error('同步已在进行中');
    }

    try {
      this.isSyncing = true;
      const startTime = Date.now();

      console.log(`🔄 开始同步: ${request.id}`);

      // 执行实际的同步操作
      const result = await this.performSync(request);

      // 更新统计
      this.stats.totalSyncs++;
      if (result.success) {
        this.stats.successfulSyncs++;
        this.lastSyncTime = Date.now();
        if (result.configHash) {
          this.lastConfigHash = result.configHash;
        }
      } else {
        this.stats.failedSyncs++;
      }

      const duration = Date.now() - startTime;
      console.log(`✅ 同步完成: ${request.id}, 耗时: ${duration}ms, 成功: ${result.success}`);

      // 处理队列中的下一个请求
      setImmediate(() => this.processQueue());

      return result;

    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * 执行实际的同步操作
   */
  async performSync(request) {
    try {
      const gostConfigService = require('./gostConfigService');

      // 生成新配置
      const newConfig = await gostConfigService.generateGostConfig();
      const newConfigHash = this.calculateConfigHash(newConfig);

      // 检查配置是否有变化
      if (!request.force && this.lastConfigHash === newConfigHash) {
        console.log(`📋 配置无变化，跳过更新: ${request.id}`);
        return {
          success: true,
          updated: false,
          reason: 'no_changes',
          configHash: newConfigHash,
          servicesCount: newConfig.services.length
        };
      }

      // 更新GOST服务
      await gostConfigService.updateGostService(newConfig);

      console.log(`🔄 配置已更新: ${request.id}, 服务数: ${newConfig.services.length}`);

      return {
        success: true,
        updated: true,
        configHash: newConfigHash,
        servicesCount: newConfig.services.length,
        trigger: request.trigger
      };

    } catch (error) {
      console.error(`❌ 同步执行失败: ${request.id}`, error);
      return {
        success: false,
        error: error.message,
        trigger: request.trigger
      };
    }
  }

  /**
   * 处理队列
   */
  async processQueue() {
    if (this.isSyncing || this.syncQueue.length === 0) {
      return;
    }

    // 获取下一个请求
    const nextRequest = this.syncQueue.shift();
    console.log(`📤 处理队列请求: ${nextRequest.id}`);

    try {
      await this.executeSync(nextRequest);
    } catch (error) {
      console.error(`❌ 处理队列请求失败: ${nextRequest.id}`, error);
    }
  }

  /**
   * 启动自动同步
   */
  startAutoSync() {
    if (this.autoSyncTimer) {
      console.log('⚠️ 自动同步已在运行');
      return;
    }

    console.log(`🚀 启动自动同步，间隔: ${this.config.autoSyncInterval / 1000}秒`);

    // 延迟启动
    setTimeout(() => {
      this.requestSync('auto_initial', false, 3).catch(error => {
        console.error('初始自动同步失败:', error);
      });
    }, 10000); // 10秒后启动

    // 设置定时器
    this.autoSyncTimer = setInterval(() => {
      this.requestSync('auto_periodic', false, 3).catch(error => {
        console.error('定期自动同步失败:', error);
      });
    }, this.config.autoSyncInterval);
  }

  /**
   * 停止自动同步
   */
  stopAutoSync() {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
      console.log('🛑 自动同步已停止');
    }
  }

  /**
   * 计算配置哈希
   */
  calculateConfigHash(config) {
    const configStr = JSON.stringify(config, null, 0);
    return crypto.createHash('sha256').update(configStr).digest('hex');
  }

  /**
   * 生成请求ID
   */
  generateRequestId() {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  }

  /**
   * 获取状态
   */
  getStatus() {
    return {
      isSyncing: this.isSyncing,
      queueLength: this.syncQueue.length,
      lastSyncTime: this.lastSyncTime,
      autoSyncRunning: !!this.autoSyncTimer,
      stats: { ...this.stats },
      config: this.config
    };
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.stopAutoSync();
    this.syncQueue = [];
    console.log('🧹 简化同步服务资源已清理');
  }
}

module.exports = new SimplifiedSyncService();
