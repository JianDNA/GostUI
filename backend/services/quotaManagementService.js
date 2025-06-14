/**
 * 流量配额管理服务
 * 管理用户流量配额状态，触发GOST配置更新
 */

const { User } = require('../models');
const gostConfigService = require('./gostConfigService');
const gostLimiterService = require('./gostLimiterService');
const quotaEventService = require('./quotaEventService'); // Phase 3: 事件记录服务

class QuotaManagementService {
  constructor() {
    this.quotaCheckInterval = 30 * 1000; // 30秒检查一次
    this.quotaCheckTimer = null;
    this.lastQuotaStates = new Map(); // 缓存上次的配额状态
    this._lastCheckTime = null;
  }

  /**
   * 检查用户流量配额状态
   * @param {number} userId - 用户ID
   * @returns {Object} 配额状态
   */
  async checkUserQuotaStatus(userId) {
    try {
      const user = await User.findByPk(userId, {
        attributes: ['id', 'username', 'role', 'isActive', 'userStatus', 'trafficQuota', 'usedTraffic']
      });

      if (!user) {
        return { status: 'user_not_found', allowed: false };
      }

      // Admin用户不受限制
      if (user.role === 'admin') {
        return {
          status: 'unlimited',
          allowed: true,
          reason: 'Admin user has unlimited access'
        };
      }

      // 检查用户状态
      if (!user.isActive || user.userStatus !== 'active') {
        return {
          status: 'user_inactive',
          allowed: false,
          reason: `User status: ${user.userStatus}, active: ${user.isActive}`
        };
      }

      // 检查流量配额
      const usedTraffic = user.usedTraffic || 0;
      const trafficQuota = user.trafficQuota; // GB

      if (!trafficQuota || trafficQuota <= 0) {
        return {
          status: 'no_quota',
          allowed: true,
          reason: 'No traffic quota set'
        };
      }

      const quotaBytes = trafficQuota * 1024 * 1024 * 1024; // 转换为字节
      const exceeded = usedTraffic >= quotaBytes;
      const usagePercentage = (usedTraffic / quotaBytes * 100);

      // 🔧 Phase 3: 添加告警级别判断
      let alertLevel = 'normal';
      let status = 'within_quota';

      if (exceeded) {
        status = 'quota_exceeded';
        alertLevel = 'critical';
      } else if (usagePercentage >= 90) {
        status = 'quota_warning';
        alertLevel = 'warning';
      } else if (usagePercentage >= 80) {
        status = 'quota_caution';
        alertLevel = 'caution';
      }

      return {
        status,
        allowed: !exceeded,
        alertLevel,
        usedTraffic,
        quotaBytes,
        usagePercentage: usagePercentage.toFixed(2),
        remainingTraffic: Math.max(0, quotaBytes - usedTraffic),
        reason: exceeded ? 'Traffic quota exceeded' :
                usagePercentage >= 90 ? 'Traffic quota nearly exhausted' :
                usagePercentage >= 80 ? 'Traffic quota usage high' :
                'Within quota limit'
      };

    } catch (error) {
      console.error(`❌ [配额管理] 检查用户 ${userId} 配额失败:`, error);
      return { status: 'error', allowed: true, error: error.message };
    }
  }

  /**
   * 检查所有用户的配额状态
   * @returns {Array} 所有用户的配额状态
   */
  async checkAllUsersQuotaStatus() {
    try {
      const users = await User.findAll({
        where: { isActive: true },
        attributes: ['id', 'username', 'role', 'userStatus', 'trafficQuota', 'usedTraffic']
      });

      const results = [];
      for (const user of users) {
        const quotaStatus = await this.checkUserQuotaStatus(user.id);
        results.push({
          userId: user.id,
          username: user.username,
          role: user.role,
          ...quotaStatus
        });
      }

      return results;
    } catch (error) {
      console.error(`❌ [配额管理] 检查所有用户配额失败:`, error);
      return [];
    }
  }

  /**
   * 处理配额状态变化
   * @param {number} userId - 用户ID
   * @param {Object} newStatus - 新的配额状态
   * @param {Object} oldStatus - 旧的配额状态
   */
  async handleQuotaStatusChange(userId, newStatus, oldStatus) {
    try {
      const user = await User.findByPk(userId, {
        attributes: ['username', 'role']
      });

      if (!user) return;

      console.log(`🔄 [配额管理] 用户 ${user.username} 配额状态变化:`);
      console.log(`   旧状态: ${oldStatus?.status || 'unknown'} (允许: ${oldStatus?.allowed || false})`);
      console.log(`   新状态: ${newStatus.status} (允许: ${newStatus.allowed})`);

      // 🔧 Phase 3: 记录配额状态变化事件
      quotaEventService.recordQuotaStatusChange(userId, user.username, oldStatus, newStatus);

      // 如果状态从允许变为禁止，或从禁止变为允许
      if (oldStatus && oldStatus.allowed !== newStatus.allowed) {
        console.log(`🚨 [配额管理] 用户 ${user.username} 访问权限变化: ${oldStatus.allowed} -> ${newStatus.allowed}`);

        // 清除限制器缓存，确保立即生效
        gostLimiterService.clearUserQuotaCache(userId);

        // 记录重要的状态变化
        if (!newStatus.allowed) {
          console.log(`🚫 [配额管理] 用户 ${user.username} 流量超限，已禁止访问`);
          quotaEventService.recordQuotaExceeded(userId, user.username, newStatus);
        } else {
          console.log(`✅ [配额管理] 用户 ${user.username} 恢复访问权限`);
        }

        // 可以在这里添加通知逻辑，比如发送邮件、推送消息等
        await this.notifyQuotaStatusChange(userId, user.username, newStatus, oldStatus);
      }

      // 🔧 Phase 3: 检查告警级别变化
      if (oldStatus && oldStatus.alertLevel !== newStatus.alertLevel && newStatus.alertLevel !== 'normal') {
        quotaEventService.recordQuotaAlert(userId, user.username, newStatus);
      }

    } catch (error) {
      console.error(`❌ [配额管理] 处理用户 ${userId} 配额状态变化失败:`, error);
    }
  }

  /**
   * 通知配额状态变化
   * @param {number} userId - 用户ID
   * @param {string} username - 用户名
   * @param {Object} newStatus - 新状态
   * @param {Object} oldStatus - 旧状态
   */
  async notifyQuotaStatusChange(userId, username, newStatus, oldStatus) {
    try {
      // 这里可以实现各种通知方式
      // 比如：邮件通知、WebSocket推送、日志记录等

      const notification = {
        userId,
        username,
        timestamp: new Date().toISOString(),
        type: newStatus.allowed ? 'quota_restored' : 'quota_exceeded',
        oldStatus: oldStatus?.status,
        newStatus: newStatus.status,
        usagePercentage: newStatus.usagePercentage,
        reason: newStatus.reason
      };

      console.log(`📢 [配额管理] 配额状态变化通知:`, notification);

      // TODO: 实现具体的通知逻辑
      // - 发送邮件
      // - WebSocket推送到前端
      // - 记录到审计日志
      // - 发送到监控系统

    } catch (error) {
      console.error(`❌ [配额管理] 发送通知失败:`, error);
    }
  }

  /**
   * 启动定期配额检查（已禁用，使用统一协调器）
   */
  startQuotaMonitoring() {
    console.log('⚠️ [配额管理] 定期配额检查已禁用，使用统一配额协调器');
    // 不再启动定时器，避免与统一协调器冲突
  }

  /**
   * 停止配额监控
   */
  stopQuotaMonitoring() {
    if (this.quotaCheckTimer) {
      clearInterval(this.quotaCheckTimer);
      this.quotaCheckTimer = null;
      console.log('📊 [配额管理] 配额监控已停止');
    }
  }

  /**
   * 获取配额管理服务状态
   * @returns {Object} 服务状态信息
   */
  getStatus() {
    return {
      isRunning: !!this.quotaCheckTimer,
      quotaCheckInterval: this.quotaCheckInterval,
      cachedStatesCount: this.lastQuotaStates.size,
      lastCheckTime: this._lastCheckTime || null,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 执行配额检查
   */
  async performQuotaCheck() {
    try {
      this._lastCheckTime = new Date().toISOString();
      const allStatuses = await this.checkAllUsersQuotaStatus();

      for (const status of allStatuses) {
        const oldStatus = this.lastQuotaStates.get(status.userId);

        // 检查状态是否发生变化
        if (!oldStatus || oldStatus.allowed !== status.allowed || oldStatus.status !== status.status) {
          await this.handleQuotaStatusChange(status.userId, status, oldStatus);
        }

        // 更新缓存的状态
        this.lastQuotaStates.set(status.userId, status);
      }

    } catch (error) {
      console.error('❌ [配额管理] 执行配额检查失败:', error);
    }
  }

  /**
   * 手动触发配额检查
   * @param {number} userId - 可选，指定用户ID
   */
  async triggerQuotaCheck(userId = null) {
    try {
      if (userId) {
        console.log(`🔍 [配额管理] 手动检查用户 ${userId} 配额...`);
        const newStatus = await this.checkUserQuotaStatus(userId);
        const oldStatus = this.lastQuotaStates.get(userId);

        if (!oldStatus || oldStatus.allowed !== newStatus.allowed || oldStatus.status !== newStatus.status) {
          await this.handleQuotaStatusChange(userId, newStatus, oldStatus);
        }

        this.lastQuotaStates.set(userId, newStatus);
        return newStatus;
      } else {
        console.log(`🔍 [配额管理] 手动检查所有用户配额...`);
        await this.performQuotaCheck();
        return this.lastQuotaStates;
      }
    } catch (error) {
      console.error('❌ [配额管理] 手动配额检查失败:', error);
      throw error;
    }
  }

  /**
   * 重置用户流量配额
   * @param {number} userId - 用户ID
   * @param {string} reason - 重置原因
   */
  async resetUserQuota(userId, reason = 'Manual reset') {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('用户不存在');
      }

      // 重置流量
      await user.update({ usedTraffic: 0 });

      console.log(`🔄 [配额管理] 用户 ${user.username} 流量已重置，原因: ${reason}`);

      // 🔧 Phase 3: 记录配额重置事件
      quotaEventService.recordQuotaReset(userId, user.username, reason, 'admin');

      // 清除限制器缓存
      gostLimiterService.clearUserQuotaCache(userId);

      // 立即检查配额状态
      await this.triggerQuotaCheck(userId);

      // 使用统一配额协调器处理规则恢复
      try {
        const quotaCoordinatorService = require('./quotaCoordinatorService');
        const result = await quotaCoordinatorService.forceRefreshUser(userId, 'traffic_reset');
        console.log(`✅ [配额管理] 流量重置后配额状态: ${result.allowed ? '允许' : '禁止'} - ${result.reason}`);
      } catch (error) {
        console.error('❌ [配额管理] 通知配额协调器失败:', error);
      }

      return true;
    } catch (error) {
      console.error(`❌ [配额管理] 重置用户 ${userId} 流量失败:`, error);
      throw error;
    }
  }

  /**
   * 清除所有配额缓存
   */
  clearAllQuotaCache() {
    this.lastQuotaStates.clear();
    console.log(`🧹 [配额管理] 清除所有配额状态缓存`);
  }

  /**
   * 清除指定用户的配额缓存
   * @param {number} userId - 用户ID
   */
  clearUserQuotaCache(userId) {
    this.lastQuotaStates.delete(userId);
    console.log(`🧹 [配额管理] 清除用户 ${userId} 配额状态缓存`);
  }

  /**
   * 获取配额管理统计信息
   */
  getQuotaStats() {
    return {
      monitoringActive: !!this.quotaCheckTimer,
      checkInterval: this.quotaCheckInterval,
      cachedStates: this.lastQuotaStates.size,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 获取用户配额状态
   */
  async getUserQuotaStatus(userId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        return { error: '用户不存在' };
      }

      const quotaCheck = await this.checkUserQuotaStatus(userId);

      return {
        userId: user.id,
        username: user.username,
        trafficQuota: user.trafficQuota,
        usedTraffic: user.usedTraffic,
        remainingTraffic: Math.max(0, user.trafficQuota - user.usedTraffic),
        usagePercentage: user.trafficQuota > 0 ? (user.usedTraffic / user.trafficQuota * 100) : 0,
        quotaStatus: quotaCheck.status,
        allowed: quotaCheck.allowed,
        reason: quotaCheck.reason
      };
    } catch (error) {
      console.error('❌ [配额管理] 获取用户配额状态失败:', error);
      return { error: '获取配额状态失败' };
    }
  }

  /**
   * 获取所有用户的配额状态概览
   */
  async getAllUsersQuotaStatus() {
    try {
      const users = await User.findAll({
        attributes: ['id', 'username', 'trafficQuota', 'usedTraffic', 'userStatus'],
        include: [{
          model: UserForwardRule,
          attributes: ['id', 'name', 'sourcePort', 'isActive'],
          required: false
        }]
      });

      const statusOverview = [];

      for (const user of users) {
        const quotaCheck = await this.checkUserQuotaStatus(user.id);
        const activeRules = user.UserForwardRules?.filter(rule => rule.isActive) || [];

        statusOverview.push({
          userId: user.id,
          username: user.username,
          trafficQuota: user.trafficQuota,
          usedTraffic: user.usedTraffic,
          remainingTraffic: Math.max(0, user.trafficQuota - user.usedTraffic),
          usagePercentage: user.trafficQuota > 0 ? (user.usedTraffic / user.trafficQuota * 100) : 0,
          quotaStatus: quotaCheck.status,
          allowed: quotaCheck.allowed,
          reason: quotaCheck.reason,
          activeRulesCount: activeRules.length,
          totalRulesCount: user.UserForwardRules?.length || 0,
          userStatus: user.userStatus
        });
      }

      return statusOverview;
    } catch (error) {
      console.error('❌ [配额管理] 获取所有用户配额状态失败:', error);
      return [];
    }
  }

  /**
   * 获取配额管理统计信息
   */
  async getQuotaStatistics() {
    try {
      const users = await User.findAll({
        attributes: ['id', 'trafficQuota', 'usedTraffic', 'userStatus']
      });

      let totalUsers = users.length;
      let activeUsers = 0;
      let quotaExceededUsers = 0;
      let unlimitedUsers = 0;
      let totalQuota = 0;
      let totalUsedTraffic = 0;

      for (const user of users) {
        if (user.userStatus === 'active') {
          activeUsers++;
        }

        if (user.trafficQuota === -1) {
          unlimitedUsers++;
        } else {
          totalQuota += user.trafficQuota;
          if (user.usedTraffic >= user.trafficQuota) {
            quotaExceededUsers++;
          }
        }

        totalUsedTraffic += user.usedTraffic;
      }

      return {
        totalUsers,
        activeUsers,
        quotaExceededUsers,
        unlimitedUsers,
        totalQuota,
        totalUsedTraffic,
        averageUsage: totalUsers > 0 ? totalUsedTraffic / totalUsers : 0,
        quotaUtilization: totalQuota > 0 ? (totalUsedTraffic / totalQuota * 100) : 0
      };
    } catch (error) {
      console.error('❌ [配额管理] 获取配额统计信息失败:', error);
      return null;
    }
  }
}

module.exports = new QuotaManagementService();
