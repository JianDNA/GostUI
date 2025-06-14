/**
 * GOST同步协调器
 * 统一管理所有GOST配置同步操作，避免并发冲突
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { defaultLogger: logger } = require('../utils/logger');
const { inspectObject, safeGet, traceCall } = require('../utils/debugHelper');
const { safeAsync, ServiceError, formatError } = require('../utils/errorHandler');

class GostSyncCoordinator {
  constructor() {
    // 同步状态管理
    this.isSyncing = false;
    this.syncQueue = [];
    this.lastSyncTime = null;
    this.lastConfigHash = null;

    // 🚀 从性能配置管理器获取配置参数
    this.updateSyncConfig();
    this.maxQueueSize = 10; // 最大队列大小（减少队列）
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

    logger.info('🔄 [同步协调] 协调器初始化');
  }

  /**
   * 🚀 新增: 更新同步配置
   */
  updateSyncConfig() {
    try {
      const performanceConfigManager = require('./performanceConfigManager');
      const syncConfig = performanceConfigManager.getSyncConfig();

      this.minSyncInterval = syncConfig.minSyncInterval || 10000;
      this.autoSyncInterval = syncConfig.autoSyncInterval || 5 * 60 * 1000; // 5分钟

      logger.info(`🔧 [同步协调器] 配置已更新: 自动同步${this.autoSyncInterval / 1000}秒, 最小间隔${this.minSyncInterval / 1000}秒`);
    } catch (error) {
      logger.warn('⚠️ [同步协调器] 更新配置失败，使用默认值:', error.message);
      this.minSyncInterval = 10000;
      this.autoSyncInterval = 5 * 60 * 1000; // 5分钟
    }
  }

  /**
   * 请求同步（主要入口）
   * @param {string} trigger - 触发源
   * @param {boolean} force - 是否强制同步
   * @param {number} priority - 优先级 (1-10, 10最高)
   */
  async requestSync(trigger = 'unknown', force = false, priority = 5) {
    try {
      const request = {
        id: this.generateRequestId(),
        trigger,
        force,
        priority,
        timestamp: Date.now(),
        status: 'queued'
      };

      logger.info(`📥 [同步协调] 收到同步请求: ${request.id} (触发源: ${trigger}, 强制: ${force}, 优先级: ${priority})`);

      try {
        // 检查是否需要跳过
        if (!force && this.shouldSkipSync(trigger)) {
          this.stats.skippedSyncs++;
          logger.info(`⏭️ [同步协调] 跳过同步请求: ${request.id} - 间隔未到或无变化`);
          return { skipped: true, reason: 'interval_not_reached' };
        }

        // 🔧 紧急请求抢占机制：对于紧急配额禁用，立即执行
        if (trigger === 'emergency_quota_disable' && priority >= 10) {
          logger.info(`🚨 [同步协调] 紧急请求抢占: ${request.id} - 立即执行`);

          // 如果当前有同步在进行，等待其完成（最多等待5秒）
          if (this.isSyncing) {
            logger.info(`⏳ [同步协调] 等待当前同步完成以执行紧急请求: ${request.id}`);
            const maxWait = 5000; // 最多等待5秒
            const startWait = Date.now();

            while (this.isSyncing && (Date.now() - startWait) < maxWait) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }

            if (this.isSyncing) {
              logger.info(`⚠️ [同步协调] 等待超时，强制执行紧急请求: ${request.id}`);
              // 强制释放锁并执行
              this.isSyncing = false;
              await this.releaseLock();
            }
          }

          try {
            return await this.executeSync(request);
          } catch (execError) {
            const errorMessage = execError ? (execError.message || "未知错误") : "未知错误";
            logger.error(`❌ [同步协调] 紧急请求执行失败: ${request.id}`, errorMessage);
            return { success: false, error: errorMessage };
          }
        }

        // 如果当前没有同步进行，立即执行
        if (!this.isSyncing) {
          try {
            return await this.executeSync(request);
          } catch (execError) {
            const errorMessage = execError ? (execError.message || "未知错误") : "未知错误";
            logger.error(`❌ [同步协调] 同步请求执行失败: ${request.id}`, errorMessage);
            return { success: false, error: errorMessage };
          }
        }

        // 加入队列
        return await this.enqueueSync(request);

      } catch (innerError) {
        const errorMessage = innerError ? (innerError.message || "未知错误") : "未知错误";
        logger.error(`❌ [同步协调] 处理同步请求内部错误: ${request.id}`, errorMessage);
        this.stats.failedSyncs++;
        return { success: false, error: errorMessage };
      }
    } catch (outerError) {
      // 捕获整个requestSync过程中的任何错误，包括请求对象创建失败等
      const errorMessage = outerError ? (outerError.message || "未知错误") : "未知错误";
      logger.error(`❌ [同步协调] 创建同步请求失败:`, errorMessage);
      this.stats.failedSyncs++;
      return { success: false, error: errorMessage };
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
      'user_expiry_extended',     // 🔧 确保用户过期时间延长永不被跳过
      'protocol_config_update'    // 🚀 确保协议配置更新永不被跳过
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
      logger.warn(`🗑️ [同步协调] 队列已满，移除低优先级请求: ${removed.id}`);
    }

    // 检查是否有相同触发源的请求
    const existingIndex = this.syncQueue.findIndex(req => req.trigger === request.trigger);
    if (existingIndex !== -1) {
      // 替换为更高优先级的请求
      const existing = this.syncQueue[existingIndex];
      if (request.priority > existing.priority) {
        this.syncQueue[existingIndex] = request;
        logger.info(`🔄 [同步协调] 替换队列中的请求: ${existing.id} -> ${request.id}`);
      } else {
        logger.warn(`⏭️ [同步协调] 跳过重复的低优先级请求: ${request.id}`);
        return { queued: false, reason: 'duplicate_lower_priority' };
      }
    } else {
      // 添加到队列
      this.syncQueue.push(request);
      this.syncQueue.sort((a, b) => b.priority - a.priority); // 按优先级排序
    }

    this.stats.queuedRequests++;
    logger.info(`📋 [同步协调] 请求已加入队列: ${request.id}, 队列长度: ${this.syncQueue.length}`);

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

      logger.info(`🔄 [同步协调] 开始执行同步: ${request.id}`);

      // 执行实际的同步操作
      let result;
      try {
        result = await this.performSync(request);
        // 确保result是一个有效的对象
        if (!result) {
          result = {
            success: false,
            error: "同步操作返回了空结果",
            trigger: request.trigger
          };
        }
      } catch (syncError) {
        // 捕获performSync可能抛出的任何错误
        const errorMessage = syncError ? (syncError.message || "未知错误") : "未知错误";
        logger.error(`❌ [同步协调] performSync执行异常: ${request.id}`, errorMessage);
        
        result = {
          success: false,
          error: errorMessage,
          trigger: request.trigger
        };
      }

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
        this.stats.lastError = result.error || "未知错误";
      }

      request.status = result.success ? 'completed' : 'failed';
      request.endTime = Date.now();
      request.duration = request.endTime - request.startTime;

      logger.info(`✅ [同步协调] 同步完成: ${request.id}, 耗时: ${request.duration}ms, 成功: ${result.success}`);

      // 处理队列中的下一个请求
      setImmediate(() => this.processQueue());

      return result;

    } catch (error) {
      // 捕获整个executeSync过程中的任何错误
      const errorMessage = error ? (error.message || "未知错误") : "未知错误";
      logger.error(`❌ [同步协调] 执行同步过程异常: ${request.id}`, errorMessage);
      
      // 更新统计
      this.stats.totalSyncs++;
      this.stats.failedSyncs++;
      this.stats.lastError = errorMessage;
      
      // 更新请求状态
      request.status = 'failed';
      request.endTime = Date.now();
      request.duration = request.endTime - request.startTime;
      
      return {
        success: false,
        error: errorMessage,
        trigger: request.trigger
      };
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
      const systemModeManager = require('./systemModeManager');

      // 检查是否处于单机模式，如果是则使用简化的配置
      const isSimpleMode = systemModeManager.isSimpleMode();
      if (isSimpleMode) {
        logger.info(`🔧 [同步协调] 检测到单机模式，使用简化配置: ${request.id}`);
      }

      // 生成新配置
      let newConfig;
      try {
        logger.info(`🔄 [同步协调] 开始生成配置: ${request.id}`);
        
        // 使用 traceCall 包装函数调用，以获取更详细的错误信息
        newConfig = await traceCall(async () => {
          const config = await gostConfigService.generateGostConfig();
          // 打印配置结构，但不打印所有细节
          logger.info(`📋 [同步协调] 配置结构: services=${safeGet(config, 'services.length', 0)}, chains=${safeGet(config, 'chains.length', 0)}, observers=${safeGet(config, 'observers.length', 0)}`);
          return config;
        });
        
        logger.info(`✅ [同步协调] 配置生成成功: ${request.id}, 服务数: ${newConfig.services ? newConfig.services.length : 0}`);
      } catch (configError) {
        // 使用 inspectObject 详细打印错误
        logger.error(`❌ [同步协调] 生成配置失败: ${request.id}, 错误详情: ${inspectObject(configError || {})}`);
        
        // 在单机模式下使用最小配置
        if (isSimpleMode) {
          logger.info(`🔧 [同步协调] 单机模式下使用最小配置: ${request.id}`);
          newConfig = {
            services: [],
            chains: [],
            observers: [
              {
                name: "observer-0",
                plugin: {
                  type: "http",
                  addr: "http://localhost:3000/api/gost-plugin/observer",
                  timeout: "10s"
                }
              }
            ],
            api: {
              addr: ":18080",
              pathPrefix: "/api",
              accesslog: false
            }
          };
        } else {
          return {
            success: false,
            error: configError ? (configError.message || "未知错误") : "未知错误",
            trigger: request.trigger
          };
        }
      }
      
      if (!newConfig) {
        logger.error(`❌ [同步协调] 配置生成结果为空: ${request.id}`);
        return {
          success: false,
          error: "配置生成结果为空",
          trigger: request.trigger
        };
      }
      
      // 确保配置对象有必要的属性
      newConfig.services = newConfig.services || [];
      newConfig.chains = newConfig.chains || [];
      
      const newConfigHash = this.calculateConfigHash(newConfig);
      logger.info(`📊 [同步协调] 配置哈希值: ${newConfigHash.substring(0, 8)}`);

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
        logger.info(`📋 [同步协调] 配置无变化，跳过更新: ${request.id}`);
        return {
          success: true,
          updated: false,
          reason: 'no_changes',
          configHash: newConfigHash,
          servicesCount: newConfig.services.length
        };
      }

      if (shouldForceUpdate && this.lastConfigHash === newConfigHash) {
        logger.info(`🔥 [同步协调] 强制更新模式，即使配置无变化也执行: ${request.id} (触发源: ${request.trigger})`);
      }

      // 获取当前配置
      let currentConfig;
      try {
        logger.info(`🔄 [同步协调] 获取当前配置: ${request.id}`);
        currentConfig = await traceCall(async () => {
          return await gostConfigService.getCurrentPersistedConfig();
        });
        logger.info(`✅ [同步协调] 当前配置获取成功: ${request.id}`);
      } catch (configError) {
        logger.error(`❌ [同步协调] 获取当前配置失败: ${request.id}, 错误详情: ${inspectObject(configError || {})}`);
        
        // 使用空配置作为当前配置
        currentConfig = { services: [], chains: [] };
      }

      // 🔧 检查是否需要强制重启（紧急配额禁用或流量重置）
      const needsForceRestart = [
        'emergency_quota_disable',
        'traffic_reset'
      ].includes(request.trigger);

      // 更新GOST服务
      try {
        logger.info(`🔄 [同步协调] 开始更新GOST服务: ${request.id}`);
        
        // 使用 traceCall 包装函数调用
        await traceCall(async () => {
        if (needsForceRestart) {
          logger.info(`🚨 [同步协调] ${request.trigger}：使用强制重启模式: ${request.id}`);
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
        });
        
        logger.info(`✅ [同步协调] GOST服务更新成功: ${request.id}`);
      } catch (updateError) {
        logger.error(`❌ [同步协调] 更新服务失败: ${request.id}, 错误详情: ${inspectObject(updateError || {})}`);
        return {
          success: false,
          error: updateError ? (updateError.message || "未知错误") : "未知错误",
          trigger: request.trigger
        };
      }

      logger.info(`🔄 [同步协调] 配置已更新: ${request.id}, 服务数: ${newConfig.services.length}`);

      // 更新最后一次成功配置的哈希值
      this.lastConfigHash = newConfigHash;

      return {
        success: true,
        updated: true,
        configHash: newConfigHash,
        servicesCount: newConfig.services.length,
        previousServicesCount: currentConfig.services?.length || 0,
        trigger: request.trigger
      };

    } catch (error) {
      logger.error(`❌ [同步协调] 同步操作失败: ${request ? request.id : 'unknown'}, 错误详情: ${inspectObject(error || {})}`);
      return {
        success: false,
        error: error ? (error.message || "未知错误") : "未知错误",
        trigger: request ? request.trigger : 'unknown'
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
    logger.info(`📤 [同步协调] 处理队列中的请求: ${nextRequest.id}`);

    try {
      await this.executeSync(nextRequest);
    } catch (error) {
      // 修复：确保error不为undefined，并提供默认错误消息
      const errorMessage = error ? (error.message || "未知错误") : "未知错误";
      logger.error(`❌ [同步协调] 处理队列请求失败: ${nextRequest.id}`, errorMessage);
    }
  }

  /**
   * 获取同步锁
   */
  async acquireLock(requestId) {
    if (this.syncLock) {
      const lockAge = Date.now() - this.syncLock.timestamp;
      if (lockAge > this.lockTimeout) {
        logger.info(`⚠️ [同步协调] 检测到过期锁，强制释放: ${this.syncLock.requestId}`);
        this.syncLock = null;
      } else {
        throw new Error(`同步锁被占用: ${this.syncLock.requestId}`);
      }
    }

    this.syncLock = {
      requestId,
      timestamp: Date.now()
    };

    logger.info(`🔒 [同步协调] 获取同步锁: ${requestId}`);
  }

  /**
   * 释放同步锁
   */
  async releaseLock() {
    if (this.syncLock) {
      logger.info(`🔓 [同步协调] 释放同步锁: ${this.syncLock.requestId}`);
      this.syncLock = null;
    }
  }

  /**
   * 启动自动同步
   */
  startAutoSync() {
    if (this.autoSyncTimer) {
      logger.info('⚠️ [同步协调] 自动同步已在运行');
      return;
    }

    logger.info(`🚀 [同步协调] 启动自动同步，间隔: ${this.autoSyncInterval / 1000}秒`);

    // 延迟启动
    setTimeout(() => {
      this.requestSync('auto_initial', false, 3).catch(error => {
        // 修复：确保error不为undefined，并提供默认错误消息
        const errorMessage = error ? (error.message || "未知错误") : "未知错误";
        logger.error('初始自动同步失败:', errorMessage);
      });
    }, 5000);

    // 设置定时器
    this.autoSyncTimer = setInterval(() => {
      this.requestSync('auto_periodic', false, 3).catch(error => {
        // 修复：确保error不为undefined，并提供默认错误消息
        const errorMessage = error ? (error.message || "未知错误") : "未知错误";
        logger.error('定期自动同步失败:', errorMessage);
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
      logger.info('🛑 [同步协调] 自动同步已停止');
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
    logger.info('🧹 [同步协调] 资源已清理');
  }
}

// 创建单例实例
const gostSyncCoordinator = new GostSyncCoordinator();

module.exports = gostSyncCoordinator;
