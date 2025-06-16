/**
 * 实时流量监控服务
 * 解决持续连接绕过配额限制的问题
 */

const { User, UserForwardRule } = require('../models');
const quotaCoordinatorService = require('./quotaCoordinatorService');

class RealTimeTrafficMonitor {
  constructor() {
    // 🔧 优化模式：平衡性能和响应速度
    this.monitoringInterval = 10000; // 🔧 优化：10秒检查一次（平衡性能）
    this.monitorTimer = null;
    this.userLastCheck = new Map(); // 记录用户上次检查时间
    this.userLastTraffic = new Map(); // 记录用户上次流量
    this.activeConnections = new Map(); // 记录活跃连接
    this.quotaViolations = new Map(); // 记录配额违规

    // 🔧 超激进模式：极低的流量增长阈值
    this.trafficGrowthThreshold = 1024 * 1024; // 1MB增长触发检查（超激进阈值）
    this.rapidGrowthThreshold = 5 * 1024 * 1024; // 5MB快速增长（超激进阈值）

    // 🔧 优化模式：合理的强制检查频率
    this.forceCheckInterval = 30000; // 30秒强制检查所有用户（优化频率）
    this.lastForceCheck = 0;

    // 🔧 保护正常用户：智能检查策略
    this.normalUserProtection = true; // 启用正常用户保护
    this.protectionThreshold = 0.8; // 80%配额以下的用户使用宽松策略

    console.log('🔍 实时流量监控服务已初始化（优化模式 + 用户保护）');
  }

  /**
   * 启动实时监控
   */
  startMonitoring() {
    if (this.monitorTimer) {
      console.log('⚠️ [实时监控] 监控已在运行');
      return;
    }

    console.log(`🚀 [实时监控] 启动实时流量监控，检查间隔: ${this.monitoringInterval / 1000}秒`);

    // 立即执行一次检查
    setTimeout(() => {
      this.performRealTimeCheck().catch(error => {
        console.error('初始实时检查失败:', error);
      });
    }, 2000);

    // 设置定时器
    this.monitorTimer = setInterval(async () => {
      try {
        await this.performRealTimeCheck();
      } catch (error) {
        console.error('❌ [实时监控] 定期检查失败:', error);
      }
    }, this.monitoringInterval);
  }

  /**
   * 停止实时监控
   */
  stopMonitoring() {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
      console.log('🛑 [实时监控] 实时流量监控已停止');
    }
  }

  /**
   * 执行实时检查
   */
  async performRealTimeCheck() {
    try {
      // 获取所有活跃用户
      const activeUsers = await User.findAll({
        where: {
          isActive: true,
          userStatus: 'active',
          role: 'user' // 只监控普通用户
        },
        attributes: ['id', 'username', 'trafficQuota', 'usedTraffic']
      });

      const now = Date.now();
      let checkedUsers = 0;
      let violationUsers = 0;

      for (const user of activeUsers) {
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

        // 计算配额使用率（用于用户保护策略）
        const quotaBytes = user.trafficQuota ? user.trafficQuota * 1024 * 1024 * 1024 : 0;
        const quotaUsage = quotaBytes > 0 ? currentTraffic / quotaBytes : 0;

        // 检查是否需要进行配额检查
        const needsCheck = this.shouldPerformQuotaCheck(userId, trafficGrowth, timeSinceLastCheck, currentTraffic, quotaUsage);

        if (needsCheck.check) {
          checkedUsers++;
          // 只在重要情况下输出日志
          if (needsCheck.reason.includes('强制') || trafficGrowth > this.rapidGrowthThreshold) {
            console.log(`🔍 [实时监控] 检查用户 ${user.username}: 流量增长 ${this.formatBytes(trafficGrowth)}, 原因: ${needsCheck.reason}`);
          }

          // 执行配额检查
          const quotaResult = await quotaCoordinatorService.checkUserQuota(userId, 'realtime_monitor');

          if (!quotaResult.allowed) {
            violationUsers++;
            console.log(`🚫 [实时监控] 用户 ${user.username} 违反配额限制: ${quotaResult.reason}`);

            // 记录违规
            this.recordQuotaViolation(userId, {
              reason: quotaResult.reason,
              currentTraffic,
              trafficGrowth,
              timestamp: new Date()
            });

            // 立即暂停用户
            await this.suspendUser(userId, user.username, quotaResult.reason);

            // 🔧 新增：立即触发GOST配置同步
            console.log(`🔄 [实时监控] 用户 ${user.username} 超配额，立即同步GOST配置`);
            await this.triggerImmediateSync(userId, user.username, quotaResult.reason);

            // 🔧 修复：只有在违反配额且快速增长时才执行紧急控制
            if (trafficGrowth > this.rapidGrowthThreshold) {
              console.log(`⚡ [实时监控] 用户 ${user.username} 违反配额且快速增长 ${this.formatBytes(trafficGrowth)}，执行紧急限制`);
              await this.emergencyTrafficControl(userId, user.username, quotaResult.reason);
            }
          } else {
            // 🔧 新增：用户未违反配额但有快速增长，仅记录但不中断
            if (trafficGrowth > this.rapidGrowthThreshold) {
              console.log(`📈 [实时监控] 用户 ${user.username} 快速增长 ${this.formatBytes(trafficGrowth)}，但未违反配额，继续监控`);
              // 记录快速增长事件，但不中断服务
              this.recordQuotaViolation(userId, {
                type: 'rapid_growth_normal',
                reason: `快速增长但未违反配额: ${this.formatBytes(trafficGrowth)}`,
                currentTraffic,
                trafficGrowth,
                timestamp: new Date()
              });
            }
          }
        }
      }

      // 只在有违规或大量检查时输出统计
      if (violationUsers > 0 || checkedUsers > 5) {
        console.log(`📊 [实时监控] 检查完成: ${checkedUsers}个用户, ${violationUsers}个违规`);
      }

    } catch (error) {
      console.error('❌ [实时监控] 执行实时检查失败:', error);
    }
  }

  /**
   * 判断是否需要进行配额检查（激进模式 + 用户保护）
   */
  shouldPerformQuotaCheck(userId, trafficGrowth, timeSinceLastCheck, currentTraffic, userQuotaUsage = 0) {
    const now = Date.now();

    // 🔧 激进模式：强制定期检查所有用户
    if (now - this.lastForceCheck > this.forceCheckInterval) {
      this.lastForceCheck = now;
      return { check: true, reason: '强制定期检查（激进模式）' };
    }

    // 🛡️ 用户保护：80%配额以下的用户使用宽松策略
    const isNormalUser = this.normalUserProtection && userQuotaUsage < this.protectionThreshold;

    if (isNormalUser) {
      // 正常用户：使用宽松策略，避免过度检查
      if (trafficGrowth > this.trafficGrowthThreshold * 2) { // 4MB增长才检查
        return { check: true, reason: `正常用户流量增长 ${this.formatBytes(trafficGrowth)}` };
      }

      if (timeSinceLastCheck > 30000 && trafficGrowth > 0) { // 30秒且有增长
        return { check: true, reason: '正常用户定期检查' };
      }

      return { check: false, reason: 'normal_user_protected' };
    }

    // 🚨 高风险用户：使用激进策略

    // 1. 激进：任何流量增长都检查
    if (trafficGrowth > this.trafficGrowthThreshold) {
      return { check: true, reason: `激进检查-流量增长 ${this.formatBytes(trafficGrowth)}` };
    }

    // 2. 激进：快速增长立即检查
    if (trafficGrowth > this.rapidGrowthThreshold) {
      return { check: true, reason: `激进检查-快速增长 ${this.formatBytes(trafficGrowth)}` };
    }

    // 🔧 激进：极小流量增长也要检查
    if (trafficGrowth > 512 * 1024) { // 512KB增长就检查（激进阈值）
      return { check: true, reason: `激进检查-微量增长 ${this.formatBytes(trafficGrowth)}` };
    }

    // 🔧 激进：更频繁的时间检查
    if (timeSinceLastCheck > 10000 && trafficGrowth > 0) { // 10秒且有任何增长
      return { check: true, reason: '激进检查-10秒未检查' };
    }

    // 4. 违规记录用户：持续监控
    if (this.quotaViolations.has(userId)) {
      const violations = this.quotaViolations.get(userId);
      const recentViolation = violations.find(v =>
        Date.now() - new Date(v.timestamp).getTime() < 300000 && // 5分钟内
        v.type !== 'rapid_growth_normal' // 排除正常快速增长记录
      );
      if (recentViolation) { // 有违规记录就持续检查
        return { check: true, reason: '违规用户持续监控' };
      }
    }

    // 🔧 激进：长时间未检查就强制检查
    if (timeSinceLastCheck > 20000) { // 20秒未检查（激进时间）
      return { check: true, reason: '激进检查-长时间未检查' };
    }

    return { check: false, reason: 'no_need' };
  }

  /**
   * 暂停用户（通过用户状态控制规则）
   */
  async suspendUser(userId, username, reason) {
    try {
      const { User } = require('../models');

      const user = await User.findByPk(userId);
      if (!user) {
        console.error(`❌ [实时监控] 用户 ${userId} 不存在`);
        return;
      }

      // 记录原始状态
      const originalStatus = user.userStatus;

      // 暂停用户
      await user.update({
        userStatus: 'suspended',
        notes: `${user.notes || ''} [实时监控自动暂停: ${reason}, 原状态: ${originalStatus}]`.trim()
      });

      console.log(`🚫 [实时监控] 已暂停用户 ${username} - ${reason}`);
      console.log(`💡 所有转发规则将通过计算属性自动禁用`);

      // 🔄 新增: 使用同步触发器
      const gostSyncTrigger = require('./gostSyncTrigger');
      gostSyncTrigger.onUserUpdate(userId, 'status_change', true).catch(error => {
        console.error('实时监控暂停用户后同步失败:', error);
      });

    } catch (error) {
      console.error(`❌ [实时监控] 暂停用户 ${username} 失败:`, error);
    }
  }

  /**
   * 🔧 新增：立即触发GOST配置同步
   */
  async triggerImmediateSync(userId, username, quotaReason) {
    try {
      console.log(`🔄 [实时监控] 立即同步GOST配置 - 用户: ${username}, 原因: ${quotaReason}`);

      // 使用同步协调器立即执行同步
      const gostSyncCoordinator = require('./gostSyncCoordinator');

      const result = await gostSyncCoordinator.requestSync(
        `quota_exceeded_${userId}`,
        true,  // 强制同步
        10     // 最高优先级
      );

      if (result.success || result.queued) {
        console.log(`✅ [实时监控] GOST配置同步已触发 - 用户: ${username}`);
      } else {
        console.error(`❌ [实时监控] GOST配置同步失败 - 用户: ${username}, 错误: ${result.error}`);
      }

    } catch (error) {
      console.error(`❌ [实时监控] 立即同步失败 - 用户: ${username}:`, error);
    }
  }

  /**
   * 紧急流量控制（仅在违反配额时执行）
   */
  async emergencyTrafficControl(userId, username, quotaReason) {
    try {
      console.log(`🚨 [实时监控] 对用户 ${username} 执行紧急流量控制 - 原因: ${quotaReason}`);

      // 1. 立即暂停用户（已在上面执行过，这里确保完全暂停）
      await this.suspendUser(userId, username, `紧急控制: ${quotaReason}`);

      // 2. 记录紧急事件
      this.recordQuotaViolation(userId, {
        type: 'emergency_control',
        reason: `违反配额且快速增长: ${quotaReason}`,
        timestamp: new Date()
      });

      // 3. 🔄 新增: 触发紧急同步
      const gostSyncTrigger = require('./gostSyncTrigger');
      await gostSyncTrigger.emergencySync(`quota_exceeded_${userId}`, {
        reason: quotaReason,
        userId: userId
      });

      // 4. 可以考虑其他措施，如临时禁用用户等
      // await this.temporarilyDisableUser(userId);

    } catch (error) {
      console.error(`❌ [实时监控] 紧急流量控制失败:`, error);
    }
  }

  /**
   * 记录配额违规
   */
  recordQuotaViolation(userId, violation) {
    if (!this.quotaViolations.has(userId)) {
      this.quotaViolations.set(userId, []);
    }

    const violations = this.quotaViolations.get(userId);
    violations.push(violation);

    // 只保留最近的10条记录
    if (violations.length > 10) {
      violations.splice(0, violations.length - 10);
    }

    console.log(`📝 [实时监控] 记录用户 ${userId} 配额违规:`, violation);
  }

  /**
   * 获取监控状态
   */
  getMonitoringStatus() {
    return {
      isRunning: !!this.monitorTimer,
      monitoringInterval: this.monitoringInterval,
      trackedUsers: this.userLastCheck.size,
      violationUsers: this.quotaViolations.size,
      trafficGrowthThreshold: this.trafficGrowthThreshold,
      rapidGrowthThreshold: this.rapidGrowthThreshold,
      recentViolations: Array.from(this.quotaViolations.entries()).map(([userId, violations]) => ({
        userId,
        violationCount: violations.length,
        latestViolation: violations[violations.length - 1]
      }))
    };
  }

  /**
   * 清理过期数据
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24小时

    // 清理过期的违规记录
    for (const [userId, violations] of this.quotaViolations.entries()) {
      const validViolations = violations.filter(v =>
        now - new Date(v.timestamp).getTime() < maxAge
      );

      if (validViolations.length === 0) {
        this.quotaViolations.delete(userId);
      } else {
        this.quotaViolations.set(userId, validViolations);
      }
    }

    console.log('🧹 [实时监控] 清理过期数据完成');
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
const realTimeTrafficMonitor = new RealTimeTrafficMonitor();

// 定期清理
setInterval(() => {
  realTimeTrafficMonitor.cleanup();
}, 60 * 60 * 1000); // 每小时清理一次

module.exports = realTimeTrafficMonitor;
