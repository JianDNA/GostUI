/**
 * GOST同步触发器服务
 * 负责在用户/规则操作后主动触发GOST配置同步
 */

const { defaultLogger } = require('../utils/logger');

class GostSyncTrigger {
  constructor() {
    this.pendingSync = false;
    this.syncTimeout = null;
    this.syncDelay = 1000; // 1秒延迟，避免频繁同步
  }

  /**
   * 触发GOST配置同步
   * @param {string} trigger - 触发源
   * @param {boolean} immediate - 是否立即同步
   * @param {object} options - 同步选项
   */
  async triggerSync(trigger = 'unknown', immediate = false, options = {}) {
    try {
      defaultLogger.info(`🔄 [同步触发器] 收到同步请求: ${trigger}, 立即: ${immediate}`);

      if (immediate) {
        // 立即同步
        await this._performSync(trigger, options);
      } else {
        // 延迟同步，避免频繁操作
        this._scheduleSync(trigger, options);
      }
    } catch (error) {
      defaultLogger.error(`[同步触发器] 触发同步失败: ${error.message}`);
    }
  }

  /**
   * 调度延迟同步
   * @private
   */
  _scheduleSync(trigger, options) {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }

    this.pendingSync = true;
    this.syncTimeout = setTimeout(async () => {
      await this._performSync(trigger, options);
      this.pendingSync = false;
      this.syncTimeout = null;
    }, this.syncDelay);

    defaultLogger.debug(`[同步触发器] 已调度延迟同步: ${trigger}`);
  }

  /**
   * 执行实际同步
   * @private
   */
  async _performSync(trigger, options = {}) {
    try {
      const gostSyncCoordinator = require('./gostSyncCoordinator');
      
      // 设置同步选项
      const syncOptions = {
        trigger,
        force: options.force || false,
        priority: options.priority || 5,
        forceRestart: options.forceRestart || false
      };

      defaultLogger.info(`🔄 [同步触发器] 开始执行同步: ${trigger}`);
      const result = await gostSyncCoordinator.requestSync(trigger, syncOptions.force, syncOptions.priority);
      
      if (result.success) {
        defaultLogger.info(`✅ [同步触发器] 同步完成: ${trigger}, 更新: ${result.updated}`);
      } else {
        defaultLogger.warn(`⚠️ [同步触发器] 同步失败: ${trigger}, 原因: ${result.error || '未知'}`);
      }

      return result;
    } catch (error) {
      defaultLogger.error(`[同步触发器] 执行同步失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 用户相关操作触发器
   */
  async onUserUpdate(userId, operation, immediate = false) {
    await this.triggerSync(`user_${operation}_${userId}`, immediate, {
      priority: 7,
      force: operation === 'status_change' || operation === 'traffic_reset'
    });
  }

  /**
   * 规则相关操作触发器
   */
  async onRuleUpdate(ruleId, operation, immediate = false) {
    await this.triggerSync(`rule_${operation}_${ruleId}`, immediate, {
      priority: 8,
      force: operation === 'create' || operation === 'delete' || operation === 'status_change'
    });
  }

  /**
   * 流量相关操作触发器
   */
  async onTrafficUpdate(userId, operation, immediate = true) {
    await this.triggerSync(`traffic_${operation}_${userId}`, immediate, {
      priority: 9,
      force: true, // 流量相关操作总是强制同步
      forceRestart: operation === 'quota_exceeded' // 配额超限时强制重启
    });
  }

  /**
   * 端口相关操作触发器
   */
  async onPortUpdate(userId, operation, immediate = true) {
    await this.triggerSync(`port_${operation}_${userId}`, immediate, {
      priority: 8,
      force: true
    });
  }

  /**
   * 系统配置相关操作触发器
   */
  async onSystemConfigUpdate(configType, immediate = false) {
    await this.triggerSync(`system_config_${configType}`, immediate, {
      priority: 6,
      force: configType === 'performance' || configType === 'security'
    });
  }

  /**
   * 紧急同步触发器（用于安全相关操作）
   */
  async emergencySync(reason, options = {}) {
    defaultLogger.warn(`🚨 [同步触发器] 紧急同步: ${reason}`);
    await this.triggerSync(`emergency_${reason}`, true, {
      priority: 10,
      force: true,
      forceRestart: true,
      ...options
    });
  }

  /**
   * 获取同步状态
   */
  getSyncStatus() {
    return {
      pendingSync: this.pendingSync,
      hasScheduledSync: !!this.syncTimeout
    };
  }

  /**
   * 清理资源
   */
  cleanup() {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }
    this.pendingSync = false;
  }
}

// 创建单例实例
const gostSyncTrigger = new GostSyncTrigger();

module.exports = gostSyncTrigger;
