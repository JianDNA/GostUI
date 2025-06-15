/**
 * 配额协调器服务
 * 统一协调所有配额检查机制，避免并发冲突
 */

const { User, UserForwardRule } = require('../models');

class QuotaCoordinatorService {
  constructor() {
    this.isProcessing = new Map(); // 记录正在处理的用户
    this.lastProcessTime = new Map(); // 记录上次处理时间
    this.processingLocks = new Map(); // 处理锁
    this.minProcessInterval = 15000; // 最小处理间隔：15秒（优化后）
    this.quotaStates = new Map(); // 缓存配额状态
  }

  /**
   * 统一的配额检查入口
   * @param {number} userId - 用户ID
   * @param {string} trigger - 触发源
   * @param {boolean} force - 是否强制执行
   */
  async checkUserQuota(userId, trigger = 'unknown', force = false) {
    const lockKey = `user_${userId}`;

    try {
      // 检查是否正在处理
      if (this.isProcessing.get(lockKey) && !force) {
        console.log(`⏳ [配额协调] 用户 ${userId} 正在处理中，跳过 (触发源: ${trigger})`);
        return this.quotaStates.get(userId) || { allowed: true, reason: 'processing' };
      }

      // 检查处理间隔
      const lastTime = this.lastProcessTime.get(lockKey);
      const now = Date.now();
      if (lastTime && (now - lastTime) < this.minProcessInterval && !force) {
        console.log(`⏰ [配额协调] 用户 ${userId} 处理间隔未到，跳过 (触发源: ${trigger})`);
        return this.quotaStates.get(userId) || { allowed: true, reason: 'interval_not_reached' };
      }

      // 设置处理锁
      this.isProcessing.set(lockKey, true);
      this.lastProcessTime.set(lockKey, now);

      console.log(`🔍 [配额协调] 开始处理用户 ${userId} 配额检查 (触发源: ${trigger})`);

      // 执行实际的配额检查
      const result = await this.performQuotaCheck(userId, trigger);

      // 🔧 新增：强制同步机制 - 关键场景必须立即生效
      if (!result.allowed && result.needsRuleUpdate) {
        console.log(`🚨 [配额协调] 触发强制同步: 用户 ${userId}, 原因: ${result.reason}`);

        // 确定触发类型
        let syncTrigger = 'user_violation';
        if (result.reason.includes('user_expired')) {
          syncTrigger = 'user_expired';
        } else if (result.reason.includes('quota_exceeded')) {
          syncTrigger = 'emergency_quota_disable';
        } else if (result.reason.includes('user_inactive')) {
          syncTrigger = 'user_suspended';
        }

        try {
          // 🔄 新增: 使用同步触发器
          const gostSyncTrigger = require('./gostSyncTrigger');

          if (syncTrigger.includes('quota_exceeded')) {
            // 配额超限时使用紧急同步
            await gostSyncTrigger.emergencySync(`quota_exceeded_${userId}`, {
              reason: result.reason,
              userId: userId
            });
          } else {
            // 其他情况使用流量更新触发器
            await gostSyncTrigger.onTrafficUpdate(userId, 'quota_check', true);
          }

          console.log(`✅ [配额协调] 强制同步已触发: 用户 ${userId}, 类型: ${syncTrigger}`);
        } catch (syncError) {
          console.error(`❌ [配额协调] 强制同步失败: 用户 ${userId}`, syncError);
        }
      }

      // 缓存结果
      this.quotaStates.set(userId, result);

      console.log(`✅ [配额协调] 用户 ${userId} 配额检查完成: ${result.allowed ? '允许' : '禁止'} (${result.reason})`);

      return result;

    } catch (error) {
      console.error(`❌ [配额协调] 用户 ${userId} 配额检查失败:`, error);
      return { allowed: true, reason: 'check_failed', error: error.message };
    } finally {
      // 释放处理锁
      this.isProcessing.delete(lockKey);
    }
  }

  /**
   * 执行实际的配额检查
   */
  async performQuotaCheck(userId, trigger) {
    try {
      // 🔧 检查单机模式配置
      const performanceConfigManager = require('./performanceConfigManager');
      const pluginConfig = performanceConfigManager.getGostPluginConfig();

      // ✅ 只有在单机模式下才禁用配额强制执行，自动模式下正常执行
      if (pluginConfig.disableQuotaEnforcement) {
        console.log(`📊 [单机模式] 配额协调器跳过配额强制执行 (用户${userId}, 触发源: ${trigger})`);
        return {
          allowed: true,
          reason: 'quota_enforcement_disabled_single_click_mode',
          singleClickMode: true
        };
      }

      // 获取用户信息
      const user = await User.findByPk(userId, {
        attributes: ['id', 'username', 'role', 'isActive', 'userStatus', 'trafficQuota', 'usedTraffic', 'expiryDate', 'additionalPorts', 'portRangeStart', 'portRangeEnd']
      });

      if (!user) {
        return { allowed: false, reason: 'user_not_found' };
      }

      // 1. 检查用户基本状态
      if (!user.isActive || user.userStatus !== 'active') {
        return {
          allowed: false,
          reason: `user_inactive: status=${user.userStatus}, active=${user.isActive}`,
          needsRuleUpdate: true
        };
      }

      // 2. 检查用户过期状态
      if (user.role !== 'admin' && user.expiryDate && new Date(user.expiryDate) <= new Date()) {
        return {
          allowed: false,
          reason: 'user_expired',
          needsRuleUpdate: true
        };
      }

      // 3. Admin用户不受配额限制
      if (user.role === 'admin') {
        return {
          allowed: true,
          reason: 'admin_unlimited',
          needsRuleUpdate: false
        };
      }

      // 4. 检查流量配额
      const trafficQuota = user.trafficQuota; // GB
      const usedTraffic = user.usedTraffic || 0; // bytes

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
      console.error(`❌ [配额协调] 执行配额检查失败:`, error);
      return { allowed: true, reason: 'check_error', error: error.message };
    }
  }

  /**
   * 强制刷新用户配额状态
   */
  async forceRefreshUser(userId, trigger = 'force_refresh') {
    console.log(`🔄 [配额协调] 强制刷新用户 ${userId} 配额状态`);

    // 清除缓存
    this.quotaStates.delete(userId);
    this.lastProcessTime.delete(`user_${userId}`);

    // 🔧 修复：如果是流量重置触发，先尝试恢复用户状态
    if (trigger === 'traffic_reset') {
      try {
        const user = await User.findByPk(userId);
        if (user && (user.userStatus === 'suspended' || user.userStatus === 'quota_exceeded')) {
          // 检查用户是否应该恢复active状态
          const trafficQuota = user.trafficQuota;
          const usedTraffic = user.usedTraffic || 0;

          if (!trafficQuota || usedTraffic < (trafficQuota * 1024 * 1024 * 1024)) {
            await user.update({ userStatus: 'active' });
            console.log(`✅ [配额协调] 用户 ${userId} 状态已从 ${user.userStatus} 恢复为 active`);
          }
        }
      } catch (error) {
        console.error(`❌ [配额协调] 恢复用户状态失败:`, error);
      }
    }

    // 强制检查
    return await this.checkUserQuota(userId, trigger, true);
  }

  /**
   * 批量检查所有用户配额
   */
  async checkAllUsersQuota(trigger = 'batch_check') {
    try {
      console.log(`🔍 [配额协调] 批量检查所有用户配额 (触发源: ${trigger})`);

      const users = await User.findAll({
        where: { isActive: true },
        attributes: ['id', 'username', 'role']
      });

      const results = [];
      for (const user of users) {
        const result = await this.checkUserQuota(user.id, trigger);
        results.push({
          userId: user.id,
          username: user.username,
          role: user.role,
          ...result
        });
      }

      return results;
    } catch (error) {
      console.error(`❌ [配额协调] 批量检查失败:`, error);
      return [];
    }
  }

  /**
   * 清除所有缓存
   */
  clearAllCache() {
    console.log(`🧹 [配额协调] 清除所有缓存`);
    this.quotaStates.clear();
    this.lastProcessTime.clear();
    this.isProcessing.clear();
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    return {
      processingUsers: Array.from(this.isProcessing.keys()),
      cachedStates: this.quotaStates.size,
      lastProcessTimes: Array.from(this.lastProcessTime.entries()).map(([key, time]) => ({
        user: key,
        lastTime: new Date(time).toISOString(),
        timeSince: Date.now() - time
      }))
    };
  }

  /**
   * 格式化字节数
   */
  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
  }
}

// 创建单例实例
const quotaCoordinatorService = new QuotaCoordinatorService();

module.exports = quotaCoordinatorService;
