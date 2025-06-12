/**
 * GOST同步协调器
 * 统一管理所有GOST配置同步操作，避免并发冲突
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class GostSyncCoordinator {
  constructor() {
    // 同步状态管理
    this.isSyncing = false;
    this.syncQueue = [];
    this.lastSyncTime = null;
    this.lastConfigHash = null;

    // 🚀 从性能配置管理器获取配置参数
    this.updateSyncConfig();
    this.maxQueueSize = 5; // 最大队列大小（减少队列）
    this.syncTimeout = 30000; // 同步超时：30秒

    // 定时器
    this.autoSyncTimer = null;

    // 智能同步控制
    this.recentActivity = 'low'; // 活跃度级别
    this.lastActivityTime = Date.now();
    this.activityCheckInterval = 30000; // 30秒检查一次活跃度

    // 锁机制
    this.syncLock = null;
    this.lockTimeout = 60000; // 锁超时：60秒

    // 统计信息
    this.stats = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      queuedRequests: 0,
      skippedSyncs: 0,
      lastError: null
    };

    console.log('🔧 GOST同步协调器已初始化');
  }

  /**
   * 🚀 新增: 更新同步配置
   */
  updateSyncConfig() {
    try {
      const performanceConfigManager = require('./performanceConfigManager');
      const syncConfig = performanceConfigManager.getSyncConfig();

      this.minSyncInterval = syncConfig.minSyncInterval || 10000;
      this.autoSyncInterval = syncConfig.autoSyncInterval || 120000;

      console.log(`🔧 [同步协调器] 配置已更新: 自动同步${this.autoSyncInterval / 1000}秒, 最小间隔${this.minSyncInterval / 1000}秒`);
    } catch (error) {
      console.warn('⚠️ [同步协调器] 更新配置失败，使用默认值:', error.message);
      this.minSyncInterval = 10000;
      this.autoSyncInterval = 120000;
    }
  }

  /**
   * 请求同步（主要入口）
   * @param {string} trigger - 触发源
   * @param {boolean} force - 是否强制同步
   * @param {number} priority - 优先级 (1-10, 10最高)
   */
  async requestSync(trigger = 'unknown', force = false, priority = 5) {
    const request = {
      id: this.generateRequestId(),
      trigger,
      force,
      priority,
      timestamp: Date.now(),
      status: 'queued'
    };

    console.log(`📥 [同步协调] 收到同步请求: ${request.id} (触发源: ${trigger}, 强制: ${force}, 优先级: ${priority})`);

    try {
      // 检查是否需要跳过
      if (!force && this.shouldSkipSync(trigger)) {
        this.stats.skippedSyncs++;
        console.log(`⏭️ [同步协调] 跳过同步请求: ${request.id} - 间隔未到或无变化`);
        return { skipped: true, reason: 'interval_not_reached' };
      }

      // 🔧 紧急请求抢占机制：对于紧急配额禁用，立即执行
      if (trigger === 'emergency_quota_disable' && priority >= 10) {
        console.log(`🚨 [同步协调] 紧急请求抢占: ${request.id} - 立即执行`);

        // 如果当前有同步在进行，等待其完成（最多等待5秒）
        if (this.isSyncing) {
          console.log(`⏳ [同步协调] 等待当前同步完成以执行紧急请求: ${request.id}`);
          const maxWait = 5000; // 最多等待5秒
          const startWait = Date.now();

          while (this.isSyncing && (Date.now() - startWait) < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          if (this.isSyncing) {
            console.log(`⚠️ [同步协调] 等待超时，强制执行紧急请求: ${request.id}`);
            // 强制释放锁并执行
            this.isSyncing = false;
            await this.releaseLock();
          }
        }

        return await this.executeSync(request);
      }

      // 如果当前没有同步进行，立即执行
      if (!this.isSyncing) {
        return await this.executeSync(request);
      }

      // 加入队列
      return await this.enqueueSync(request);

    } catch (error) {
      console.error(`❌ [同步协调] 处理同步请求失败: ${request.id}`, error);
      this.stats.failedSyncs++;
      return { success: false, error: error.message };
    }
  }

  /**
   * 检查是否应该跳过同步
   */
  shouldSkipSync(trigger) {
    // 强制触发源不跳过（包括紧急配额禁用、规则CRUD操作）
    const forceTriggers = [
      'manual',
      'force',
      'admin',
      'emergency_quota_disable',  // 🔧 确保紧急配额禁用永不被跳过
      'quota_reset',
      'rule_disable',
      'rule_enable',
      'rule_create',              // 🔧 确保规则创建永不被跳过
      'rule_update',              // 🔧 确保规则更新永不被跳过
      'rule_delete',              // 🔧 确保规则删除永不被跳过
      'batch_rule_delete',        // 🔧 确保批量规则删除永不被跳过
      'user_expiry_extended'      // 🔧 确保用户过期时间延长永不被跳过
    ];
    if (forceTriggers.includes(trigger)) {
      return false;
    }

    // 检查时间间隔
    if (this.lastSyncTime) {
      const timeSinceLastSync = Date.now() - this.lastSyncTime;
      if (timeSinceLastSync < this.minSyncInterval) {
        return true;
      }
    }

    return false;
  }

  /**
   * 将同步请求加入队列
   */
  async enqueueSync(request) {
    // 检查队列大小
    if (this.syncQueue.length >= this.maxQueueSize) {
      // 移除最低优先级的请求
      this.syncQueue.sort((a, b) => a.priority - b.priority);
      const removed = this.syncQueue.shift();
      console.log(`🗑️ [同步协调] 队列已满，移除低优先级请求: ${removed.id}`);
    }

    // 检查是否有相同触发源的请求
    const existingIndex = this.syncQueue.findIndex(req => req.trigger === request.trigger);
    if (existingIndex !== -1) {
      // 替换为更高优先级的请求
      const existing = this.syncQueue[existingIndex];
      if (request.priority > existing.priority) {
        this.syncQueue[existingIndex] = request;
        console.log(`🔄 [同步协调] 替换队列中的请求: ${existing.id} -> ${request.id}`);
      } else {
        console.log(`⏭️ [同步协调] 跳过重复的低优先级请求: ${request.id}`);
        return { queued: false, reason: 'duplicate_lower_priority' };
      }
    } else {
      // 添加到队列
      this.syncQueue.push(request);
      this.syncQueue.sort((a, b) => b.priority - a.priority); // 按优先级排序
    }

    this.stats.queuedRequests++;
    console.log(`📋 [同步协调] 请求已加入队列: ${request.id}, 队列长度: ${this.syncQueue.length}`);

    return { queued: true, queuePosition: this.syncQueue.findIndex(req => req.id === request.id) + 1 };
  }

  /**
   * 执行同步
   */
  async executeSync(request) {
    if (this.isSyncing) {
      throw new Error('同步已在进行中');
    }

    // 获取同步锁
    await this.acquireLock(request.id);

    try {
      this.isSyncing = true;
      request.status = 'executing';
      request.startTime = Date.now();

      console.log(`🔄 [同步协调] 开始执行同步: ${request.id}`);

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
        this.stats.lastError = result.error;
      }

      request.status = result.success ? 'completed' : 'failed';
      request.endTime = Date.now();
      request.duration = request.endTime - request.startTime;

      console.log(`✅ [同步协调] 同步完成: ${request.id}, 耗时: ${request.duration}ms, 成功: ${result.success}`);

      // 处理队列中的下一个请求
      setImmediate(() => this.processQueue());

      return result;

    } finally {
      this.isSyncing = false;
      await this.releaseLock();
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

      // 强制更新的关键场景
      const forceUpdateScenarios = [
        'emergency_quota_disable',
        'traffic_reset',        // 🔧 添加流量重置场景
        'quota_update',         // 🔧 添加配额更新场景
        'manual',
        'quota_reset',
        'rule_disable',
        'rule_enable',
        'rule_create',          // 🔧 添加规则创建场景
        'rule_update',          // 🔧 添加规则更新场景
        'rule_delete',          // 🔧 添加规则删除场景
        'batch_rule_delete',    // 🔧 添加批量规则删除场景
        'user_expiry_extended'  // 🔧 添加用户过期时间延长场景
      ];

      const shouldForceUpdate = request.force || forceUpdateScenarios.includes(request.trigger);

      // 检查配置是否有变化
      if (!shouldForceUpdate && this.lastConfigHash === newConfigHash) {
        console.log(`📋 [同步协调] 配置无变化，跳过更新: ${request.id}`);
        return {
          success: true,
          updated: false,
          reason: 'no_changes',
          configHash: newConfigHash,
          servicesCount: newConfig.services.length
        };
      }

      if (shouldForceUpdate && this.lastConfigHash === newConfigHash) {
        console.log(`🔥 [同步协调] 强制更新模式，即使配置无变化也执行: ${request.id} (触发源: ${request.trigger})`);
      }

      // 获取当前配置
      const currentConfig = await gostConfigService.getCurrentPersistedConfig();

      // 🔧 检查是否需要强制重启（紧急配额禁用或流量重置）
      const needsForceRestart = [
        'emergency_quota_disable',
        'traffic_reset'
      ].includes(request.trigger);

      // 更新GOST服务
      if (needsForceRestart) {
        console.log(`🚨 [同步协调] ${request.trigger}：使用强制重启模式: ${request.id}`);
        await gostConfigService.updateGostService(newConfig, {
          forceRestart: true,
          trigger: request.trigger,
          force: request.force
        });
      } else {
        await gostConfigService.updateGostService(newConfig, {
          trigger: request.trigger,
          force: request.force
        });
      }

      console.log(`🔄 [同步协调] 配置已更新: ${request.id}, 服务数: ${newConfig.services.length}`);

      return {
        success: true,
        updated: true,
        configHash: newConfigHash,
        servicesCount: newConfig.services.length,
        previousServicesCount: currentConfig.services?.length || 0,
        trigger: request.trigger
      };

    } catch (error) {
      console.error(`❌ [同步协调] 同步执行失败: ${request.id}`, error);
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

    // 获取最高优先级的请求
    const nextRequest = this.syncQueue.shift();
    console.log(`📤 [同步协调] 处理队列中的请求: ${nextRequest.id}`);

    try {
      await this.executeSync(nextRequest);
    } catch (error) {
      console.error(`❌ [同步协调] 处理队列请求失败: ${nextRequest.id}`, error);
    }
  }

  /**
   * 获取同步锁
   */
  async acquireLock(requestId) {
    if (this.syncLock) {
      const lockAge = Date.now() - this.syncLock.timestamp;
      if (lockAge > this.lockTimeout) {
        console.log(`⚠️ [同步协调] 检测到过期锁，强制释放: ${this.syncLock.requestId}`);
        this.syncLock = null;
      } else {
        throw new Error(`同步锁被占用: ${this.syncLock.requestId}`);
      }
    }

    this.syncLock = {
      requestId,
      timestamp: Date.now()
    };

    console.log(`🔒 [同步协调] 获取同步锁: ${requestId}`);
  }

  /**
   * 释放同步锁
   */
  async releaseLock() {
    if (this.syncLock) {
      console.log(`🔓 [同步协调] 释放同步锁: ${this.syncLock.requestId}`);
      this.syncLock = null;
    }
  }

  /**
   * 启动自动同步
   */
  startAutoSync() {
    if (this.autoSyncTimer) {
      console.log('⚠️ [同步协调] 自动同步已在运行');
      return;
    }

    console.log(`🚀 [同步协调] 启动自动同步，间隔: ${this.autoSyncInterval / 1000}秒`);

    // 延迟启动
    setTimeout(() => {
      this.requestSync('auto_initial', false, 3).catch(error => {
        console.error('初始自动同步失败:', error);
      });
    }, 5000);

    // 设置定时器
    this.autoSyncTimer = setInterval(() => {
      this.requestSync('auto_periodic', false, 3).catch(error => {
        console.error('定期自动同步失败:', error);
      });
    }, this.autoSyncInterval);
  }

  /**
   * 停止自动同步
   */
  stopAutoSync() {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
      console.log('🛑 [同步协调] 自动同步已停止');
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
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
      hasLock: !!this.syncLock,
      stats: { ...this.stats },
      queue: this.syncQueue.map(req => ({
        id: req.id,
        trigger: req.trigger,
        priority: req.priority,
        status: req.status,
        timestamp: req.timestamp
      }))
    };
  }

  /**
   * 🚀 新增: 获取统计信息 (兼容性别名)
   */
  getStats() {
    return this.getStatus();
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.stopAutoSync();
    this.syncQueue = [];
    this.syncLock = null;
    console.log('🧹 [同步协调] 资源已清理');
  }
}

// 创建单例实例
const gostSyncCoordinator = new GostSyncCoordinator();

module.exports = gostSyncCoordinator;
