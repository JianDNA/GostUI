/**
 * 简化的流量监控服务
 * 
 * 设计理念：
 * 1. 减少检查频率，避免过度监控
 * 2. 简化日志输出，减少噪音
 * 3. 保留核心功能：配额检查、规则禁用
 * 4. 优化性能，减少数据库查询
 */

const { User, UserForwardRule } = require('../models');
const quotaCoordinatorService = require('./quotaCoordinatorService');

class SimplifiedMonitor {
  constructor() {
    // 简化的配置
    this.config = {
      monitoringInterval: 10000,      // 10秒检查一次（减少频率）
      trafficGrowthThreshold: 10 * 1024 * 1024,  // 10MB增长才检查（提高阈值）
      rapidGrowthThreshold: 50 * 1024 * 1024,    // 50MB快速增长（提高阈值）
      forceCheckInterval: 60000,      // 1分钟强制检查（减少频率）
      quotaWarningThreshold: 0.9      // 90%配额时警告
    };
    
    // 状态管理
    this.monitorTimer = null;
    this.userLastCheck = new Map();
    this.userLastTraffic = new Map();
    this.lastForceCheck = 0;
    
    // 统计信息
    this.stats = {
      checksPerformed: 0,
      violationsFound: 0,
      rulesDisabled: 0,
      lastCheck: null
    };
    
    console.log('🔍 简化监控服务已初始化');
  }

  /**
   * 启动监控
   */
  startMonitoring() {
    if (this.monitorTimer) {
      console.log('⚠️ 监控已在运行');
      return;
    }

    console.log(`🚀 启动简化监控，检查间隔: ${this.config.monitoringInterval / 1000}秒`);

    this.monitorTimer = setInterval(async () => {
      try {
        await this.performCheck();
      } catch (error) {
        console.error('❌ 监控检查失败:', error);
      }
    }, this.config.monitoringInterval);
  }

  /**
   * 停止监控
   */
  stopMonitoring() {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
      console.log('🛑 简化监控已停止');
    }
  }

  /**
   * 执行检查
   */
  async performCheck() {
    try {
      const now = Date.now();
      this.stats.lastCheck = new Date();
      
      // 获取活跃用户（减少查询字段）
      const activeUsers = await User.findAll({
        where: {
          role: 'user'
        },
        attributes: ['id', 'username', 'trafficQuota', 'usedTraffic', 'expiryDate']
      });

      let checkedUsers = 0;
      let violationUsers = 0;

      for (const user of activeUsers) {
        // 检查用户是否过期
        if (user.expiryDate && new Date(user.expiryDate) <= new Date()) {
          continue;
        }

        const userId = user.id;
        const currentTraffic = user.usedTraffic || 0;
        const lastTraffic = this.userLastTraffic.get(userId) || 0;
        const lastCheck = this.userLastCheck.get(userId) || 0;

        // 计算流量增长
        const trafficGrowth = currentTraffic - lastTraffic;
        const timeSinceLastCheck = now - lastCheck;

        // 更新记录
        this.userLastTraffic.set(userId, currentTraffic);
        this.userLastCheck.set(userId, now);

        // 判断是否需要检查
        const needsCheck = this.shouldPerformCheck(userId, trafficGrowth, timeSinceLastCheck, currentTraffic, user.trafficQuota);

        if (needsCheck.check) {
          checkedUsers++;
          this.stats.checksPerformed++;

          // 只在必要时输出日志
          if (needsCheck.priority === 'high') {
            console.log(`🔍 检查用户 ${user.username}: ${needsCheck.reason}`);
          }

          // 执行配额检查
          const quotaResult = await quotaCoordinatorService.checkUserQuota(userId, 'simplified_monitor');

          if (!quotaResult.allowed) {
            violationUsers++;
            this.stats.violationsFound++;
            
            console.log(`🚫 用户 ${user.username} 超过配额: ${quotaResult.reason}`);

            // 禁用用户规则
            await this.disableUserRules(userId, user.username, quotaResult.reason);
          } else {
            // 检查是否接近配额限制
            const quotaBytes = user.trafficQuota * 1024 * 1024 * 1024;
            const usagePercentage = currentTraffic / quotaBytes;
            
            if (usagePercentage >= this.config.quotaWarningThreshold) {
              console.log(`⚠️ 用户 ${user.username} 接近配额限制: ${(usagePercentage * 100).toFixed(1)}%`);
            }
          }
        }
      }

      // 只在有检查时输出统计信息
      if (checkedUsers > 0) {
        console.log(`📊 监控完成: 检查${checkedUsers}用户, 发现${violationUsers}违规`);
      }

    } catch (error) {
      console.error('❌ 执行监控检查失败:', error);
    }
  }

  /**
   * 判断是否需要检查（简化版）
   */
  shouldPerformCheck(userId, trafficGrowth, timeSinceLastCheck, currentTraffic, trafficQuota) {
    const now = Date.now();

    // 强制定期检查（频率降低）
    if (now - this.lastForceCheck > this.config.forceCheckInterval) {
      this.lastForceCheck = now;
      return { check: true, reason: '定期检查', priority: 'low' };
    }

    // 计算配额使用率
    const quotaBytes = trafficQuota * 1024 * 1024 * 1024;
    const usagePercentage = quotaBytes > 0 ? currentTraffic / quotaBytes : 0;

    // 高优先级检查：接近或超过配额
    if (usagePercentage >= 0.8) {
      if (trafficGrowth > this.config.trafficGrowthThreshold) {
        return { check: true, reason: `高使用率用户流量增长 ${this.formatBytes(trafficGrowth)}`, priority: 'high' };
      }
    }

    // 中优先级检查：快速增长
    if (trafficGrowth > this.config.rapidGrowthThreshold) {
      return { check: true, reason: `快速增长 ${this.formatBytes(trafficGrowth)}`, priority: 'high' };
    }

    // 低优先级检查：长时间未检查
    if (timeSinceLastCheck > 300000 && trafficGrowth > 0) { // 5分钟且有增长
      return { check: true, reason: '长时间未检查', priority: 'low' };
    }

    return { check: false, reason: 'no_need', priority: 'none' };
  }

  /**
   * 禁用用户规则
   */
  async disableUserRules(userId, username, reason) {
    try {
      const activeRules = await UserForwardRule.findAll({
        where: {
          userId: userId,
          isActive: true
        }
      });

      if (activeRules.length === 0) {
        return;
      }

      let disabledCount = 0;
      for (const rule of activeRules) {
        await rule.update({
          isActive: false,
          description: `[自动禁用: ${reason}] ${rule.description || ''}`.trim()
        });
        disabledCount++;
      }

      this.stats.rulesDisabled += disabledCount;
      console.log(`🚫 已禁用用户 ${username} 的 ${disabledCount} 个规则`);

      // 触发配置同步
      const gostSyncCoordinator = require('./gostSyncCoordinator');
      gostSyncCoordinator.requestSync('simplified_monitor_disable', false, 5).catch(error => {
        console.error('同步失败:', error);
      });

    } catch (error) {
      console.error(`❌ 禁用用户 ${username} 规则失败:`, error);
    }
  }

  /**
   * 获取监控状态
   */
  getStatus() {
    return {
      isRunning: !!this.monitorTimer,
      config: this.config,
      stats: {
        ...this.stats,
        trackedUsers: this.userLastCheck.size
      }
    };
  }

  /**
   * 清理过期数据
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24小时

    // 清理过期的用户检查记录
    for (const [userId, lastCheck] of this.userLastCheck.entries()) {
      if (now - lastCheck > maxAge) {
        this.userLastCheck.delete(userId);
        this.userLastTraffic.delete(userId);
      }
    }
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

module.exports = new SimplifiedMonitor();
