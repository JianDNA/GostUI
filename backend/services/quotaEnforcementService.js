/**
 * 配额强制执行服务
 * 当GOST限制器无法有效阻止超配额用户时，通过动态禁用转发规则来强制执行配额
 */

const { User, UserForwardRule } = require('../models');
const quotaManagementService = require('./quotaManagementService');

class QuotaEnforcementService {
  constructor() {
    this.isRunning = false;
    this.checkInterval = 15000; // 15秒检查一次，更及时响应配额变化
    this.intervalId = null;
    this.disabledRules = new Map(); // 记录被禁用的规则
  }

  /**
   * 启动配额强制执行服务（已禁用，使用统一协调器）
   */
  start() {
    console.log('⚠️ [配额强制] 定期检查已禁用，使用统一配额协调器');
    this.isRunning = false;
    // 不再启动定时器，避免与统一协调器冲突
  }

  /**
   * 停止配额强制执行服务
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 [配额强制] 停止配额强制执行服务...');

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    console.log('✅ [配额强制] 服务已停止');
  }

  /**
   * 执行配额强制检查
   */
  async enforceQuotas() {
    try {
      console.log('🔍 [配额强制] 开始检查用户配额状态...');

      // 获取所有转发规则（包括被禁用的）
      const allRules = await UserForwardRule.findAll({
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'trafficQuota', 'usedTraffic', 'userStatus']
        }]
      });

      console.log(`📊 [配额强制] 检查 ${allRules.length} 个转发规则`);

      let enforcedCount = 0;
      let restoredCount = 0;

      for (const rule of allRules) {
        const user = rule.user;  // 使用正确的关联名称
        if (!user) continue;

        // 检查用户配额状态
        const quotaCheck = await quotaManagementService.checkUserQuotaStatus(user.id);

        console.log(`🔍 [配额强制] 规则 ${rule.id} (${rule.name}): 用户=${user.username}, 活跃=${rule.isActive}, 配额允许=${quotaCheck.allowed}`);

        if (!quotaCheck.allowed) {
          // 用户超配额，需要禁用规则
          if (rule.isActive) {
            console.log(`🚫 [配额强制] 禁用规则 ${rule.id} - 原因: ${quotaCheck.reason}`);
            await this.disableRule(rule, quotaCheck.reason);
            enforcedCount++;
          } else {
            console.log(`ℹ️ [配额强制] 规则 ${rule.id} 已经被禁用`);
          }
        } else {
          // 用户配额正常，恢复被禁用的规则
          if (!rule.isActive && this.isRuleDisabledByQuota(rule)) {
            console.log(`✅ [配额强制] 恢复规则 ${rule.id}`);
            await this.enableRule(rule);
            restoredCount++;
          } else {
            console.log(`ℹ️ [配额强制] 规则 ${rule.id} 状态正常`);
          }
        }
      }

      if (enforcedCount > 0 || restoredCount > 0) {
        console.log(`📊 [配额强制] 执行完成: 禁用 ${enforcedCount} 个规则, 恢复 ${restoredCount} 个规则`);

        // 如果有规则状态变化，触发GOST配置更新
        if (enforcedCount > 0 || restoredCount > 0) {
          await this.triggerGostConfigUpdate();
        }
      } else {
        console.log('✅ [配额强制] 所有规则状态正常');
      }

    } catch (error) {
      console.error('❌ [配额强制] 执行配额检查失败:', error);
    }
  }

  /**
   * 禁用转发规则
   */
  async disableRule(rule, reason) {
    try {
      // 如果规则已经被禁用，跳过
      if (this.disabledRules.has(rule.id)) {
        return;
      }

      console.log(`🚫 [配额强制] 禁用规则 ${rule.id} (${rule.name}) - 用户 ${rule.user.username}: ${reason}`);

      // 更新数据库中的规则状态
      await rule.update({
        isActive: false,
        description: `${rule.description || ''} [配额超限自动禁用]`.trim()
      });

      // 记录被禁用的规则
      this.disabledRules.set(rule.id, {
        originalDescription: rule.description,
        disabledAt: new Date(),
        reason: reason
      });

      console.log(`✅ [配额强制] 规则 ${rule.id} 已禁用`);

    } catch (error) {
      console.error(`❌ [配额强制] 禁用规则 ${rule.id} 失败:`, error);
    }
  }

  /**
   * 启用转发规则
   */
  async enableRule(rule) {
    try {
      console.log(`✅ [配额强制] 恢复规则 ${rule.id} (${rule.name}) - 用户 ${rule.user.username}`);

      // 恢复数据库中的规则状态
      const originalDescription = rule.description?.replace(' [配额超限自动禁用]', '') || '';
      await rule.update({
        isActive: true,
        description: originalDescription
      });

      // 移除禁用记录（如果存在）
      this.disabledRules.delete(rule.id);

      console.log(`✅ [配额强制] 规则 ${rule.id} 已恢复`);

    } catch (error) {
      console.error(`❌ [配额强制] 恢复规则 ${rule.id} 失败:`, error);
    }
  }

  /**
   * 触发GOST配置更新
   */
  async triggerGostConfigUpdate() {
    try {
      console.log('🔄 [配额强制] 触发GOST配置更新...');

      // 发送配置更新请求
      const response = await fetch('http://localhost:3000/api/gost/restart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        console.log('✅ [配额强制] GOST配置更新成功');
      } else {
        console.error('❌ [配额强制] GOST配置更新失败:', response.status);
      }

    } catch (error) {
      console.error('❌ [配额强制] 触发GOST配置更新失败:', error);
    }
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      checkInterval: this.checkInterval,
      disabledRulesCount: this.disabledRules.size,
      disabledRules: Array.from(this.disabledRules.entries()).map(([ruleId, info]) => ({
        ruleId,
        disabledAt: info.disabledAt,
        reason: info.reason
      }))
    };
  }

  /**
   * 检查规则是否因配额超限被禁用
   */
  isRuleDisabledByQuota(rule) {
    // 检查内存记录
    if (this.disabledRules.has(rule.id)) {
      return true;
    }

    // 检查描述字段中是否包含配额超限标记
    return rule.description && rule.description.includes('[配额超限自动禁用]');
  }

  /**
   * 🔧 新增：立即触发GOST配置同步
   */
  async triggerImmediateSync(userId, trigger, reason) {
    try {
      console.log(`🔄 [配额强制] 立即同步GOST配置 - 触发: ${trigger}, 原因: ${reason}`);

      // 使用同步协调器立即执行同步
      const gostSyncCoordinator = require('./gostSyncCoordinator');

      const result = await gostSyncCoordinator.requestSync(
        trigger,
        true,  // 强制同步
        9      // 高优先级
      );

      if (result.success || result.queued) {
        console.log(`✅ [配额强制] GOST配置同步已触发 - 触发: ${trigger}`);
      } else {
        console.error(`❌ [配额强制] GOST配置同步失败 - 触发: ${trigger}, 错误: ${result.error}`);
      }

    } catch (error) {
      console.error(`❌ [配额强制] 立即同步失败 - 触发: ${trigger}:`, error);
    }
  }

  /**
   * 手动执行配额检查
   */
  async manualCheck() {
    console.log('🔧 [配额强制] 手动执行配额检查...');
    await this.enforceQuotas();
  }

  /**
   * 检查特定用户的配额强制执行
   * @param {number} userId - 用户ID
   */
  async checkUserQuotaEnforcement(userId) {
    try {
      console.log(`🔍 [配额强制] 检查用户 ${userId} 配额强制执行...`);

      // 获取该用户的所有转发规则
      const userRules = await UserForwardRule.findAll({
        where: { userId },
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'trafficQuota', 'usedTraffic', 'userStatus']
        }]
      });

      if (userRules.length === 0) {
        console.log(`ℹ️ [配额强制] 用户 ${userId} 没有转发规则`);
        return;
      }

      const user = userRules[0].user;
      if (!user) {
        console.log(`⚠️ [配额强制] 用户 ${userId} 不存在`);
        return;
      }

      // 检查用户配额状态
      const quotaCheck = await quotaManagementService.checkUserQuotaStatus(userId);
      console.log(`🔍 [配额强制] 用户 ${user.username} 配额状态: ${quotaCheck.allowed ? '正常' : '超限'} - ${quotaCheck.reason}`);

      let enforcedCount = 0;
      let restoredCount = 0;

      for (const rule of userRules) {
        if (!quotaCheck.allowed) {
          // 用户超配额，需要禁用规则
          if (rule.isActive) {
            console.log(`🚫 [配额强制] 立即禁用规则 ${rule.id} (${rule.name}) - 原因: ${quotaCheck.reason}`);
            await this.disableRule(rule, quotaCheck.reason);
            enforcedCount++;

            // 🔧 新增：立即触发GOST配置同步
            await this.triggerImmediateSync(userId, `rule_disabled_${rule.id}`, quotaCheck.reason);
          }
        } else {
          // 用户配额正常，恢复被禁用的规则
          if (!rule.isActive && this.isRuleDisabledByQuota(rule)) {
            console.log(`✅ [配额强制] 立即恢复规则 ${rule.id} (${rule.name})`);
            await this.enableRule(rule);
            restoredCount++;

            // 🔧 新增：立即触发GOST配置同步
            await this.triggerImmediateSync(userId, `rule_enabled_${rule.id}`, 'quota_restored');
          }
        }
      }

      if (enforcedCount > 0 || restoredCount > 0) {
        console.log(`📊 [配额强制] 用户 ${userId} 处理完成: 禁用 ${enforcedCount} 个规则, 恢复 ${restoredCount} 个规则`);

        // 立即触发GOST配置更新
        await this.triggerGostConfigUpdate();
      } else {
        console.log(`✅ [配额强制] 用户 ${userId} 规则状态正常`);
      }

    } catch (error) {
      console.error(`❌ [配额强制] 检查用户 ${userId} 配额强制执行失败:`, error);
    }
  }

  /**
   * 处理用户配额重置后的规则恢复
   * @param {number} userId - 用户ID
   */
  async handleUserQuotaReset(userId) {
    try {
      console.log(`🔄 [配额强制] 处理用户 ${userId} 配额重置，检查规则恢复...`);

      // 获取该用户的所有被禁用的规则
      const userRules = await UserForwardRule.findAll({
        where: {
          userId: userId,
          isActive: false
        },
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'username']
        }]
      });

      let restoredCount = 0;

      for (const rule of userRules) {
        // 检查这个规则是否是被配额强制执行服务禁用的
        if (this.isRuleDisabledByQuota(rule)) {
          // 检查用户当前配额状态
          const quotaCheck = await quotaManagementService.checkUserQuotaStatus(userId);

          if (quotaCheck.allowed) {
            await this.enableRule(rule);
            restoredCount++;
          }
        }
      }

      if (restoredCount > 0) {
        console.log(`✅ [配额强制] 用户 ${userId} 配额重置后恢复了 ${restoredCount} 个规则`);
        await this.triggerGostConfigUpdate();
      } else {
        console.log(`ℹ️ [配额强制] 用户 ${userId} 配额重置后无需恢复规则`);
      }

    } catch (error) {
      console.error(`❌ [配额强制] 处理用户 ${userId} 配额重置失败:`, error);
    }
  }
}

// 创建单例实例
const quotaEnforcementService = new QuotaEnforcementService();

module.exports = { quotaEnforcementService };
