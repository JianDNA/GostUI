#!/usr/bin/env node

/**
 * 修复配额重置后自动恢复转发规则的问题
 */

const { User, UserForwardRule } = require('./models');

class AutoRestoreRulesFixer {
  constructor() {
    this.testUserId = 2; // test用户ID
  }

  /**
   * 检查当前问题状态
   */
  async checkCurrentStatus() {
    try {
      console.log('🔍 检查当前问题状态...\n');

      const user = await User.findByPk(this.testUserId);
      const rules = await UserForwardRule.findAll({ where: { userId: this.testUserId } });

      console.log('📊 test用户当前状态:');
      console.log(`   配额: ${user.trafficQuota}GB`);
      console.log(`   已使用: ${(user.usedTraffic / (1024*1024*1024)).toFixed(3)}GB`);
      console.log(`   使用率: ${((user.usedTraffic / (user.trafficQuota * 1024*1024*1024)) * 100).toFixed(1)}%`);

      console.log('\n📋 转发规则状态:');
      let disabledByQuota = 0;
      rules.forEach(rule => {
        const isDisabledByQuota = rule.description && rule.description.includes('自动禁用');
        if (isDisabledByQuota) disabledByQuota++;
        
        console.log(`   规则 ${rule.id}: ${rule.name} - 端口${rule.sourcePort} - ${rule.isActive ? '✅ 活跃' : '❌ 禁用'}`);
        if (isDisabledByQuota) {
          console.log(`     ↳ 禁用原因: ${rule.description}`);
        }
      });

      console.log(`\n🚨 问题分析:`);
      console.log(`   - 因配额被禁用的规则: ${disabledByQuota}个`);
      console.log(`   - 当前配额使用率: ${((user.usedTraffic / (user.trafficQuota * 1024*1024*1024)) * 100).toFixed(1)}%`);
      
      if (disabledByQuota > 0 && user.usedTraffic < user.trafficQuota * 1024*1024*1024) {
        console.log(`   ❌ 发现问题: 用户配额充足但规则仍被禁用`);
        return { hasIssue: true, disabledRules: disabledByQuota };
      } else {
        console.log(`   ✅ 状态正常: 配额和规则状态一致`);
        return { hasIssue: false, disabledRules: disabledByQuota };
      }

    } catch (error) {
      console.error('❌ 检查状态失败:', error);
      throw error;
    }
  }

  /**
   * 重置用户流量并自动恢复规则
   */
  async resetTrafficAndRestoreRules(newQuotaGB = 0.5) {
    try {
      console.log(`\n🔄 重置用户流量并自动恢复规则...`);

      // 1. 重置用户流量
      const user = await User.findByPk(this.testUserId);
      await user.update({
        trafficQuota: newQuotaGB,
        usedTraffic: 0
      });

      console.log(`✅ 用户流量已重置: 配额${newQuotaGB}GB, 已使用0MB`);

      // 2. 自动恢复被配额禁用的规则
      const disabledRules = await UserForwardRule.findAll({
        where: { 
          userId: this.testUserId,
          isActive: false
        }
      });

      let restoredCount = 0;
      for (const rule of disabledRules) {
        // 检查是否是因为配额被禁用的规则
        if (rule.description && rule.description.includes('自动禁用')) {
          // 清理描述中的禁用信息
          const cleanDescription = rule.description
            .replace(/\[实时监控自动禁用:.*?\]/g, '')
            .replace(/\[紧急控制:.*?\]/g, '')
            .replace(/\[紧急禁用:.*?\]/g, '')
            .trim();

          await rule.update({
            isActive: true,
            description: cleanDescription || null
          });

          console.log(`✅ 已恢复规则 ${rule.id}: ${rule.name} - 端口${rule.sourcePort}`);
          restoredCount++;
        }
      }

      console.log(`\n📊 恢复结果: 共恢复 ${restoredCount} 个规则`);

      // 3. 触发GOST配置同步
      if (restoredCount > 0) {
        console.log(`🔄 触发GOST配置同步...`);
        const gostSyncCoordinator = require('./services/gostSyncCoordinator');
        await gostSyncCoordinator.requestSync('auto_restore_rules', true, 10);
        console.log(`✅ GOST配置同步已触发`);
      }

      return { restoredCount };

    } catch (error) {
      console.error('❌ 重置和恢复失败:', error);
      throw error;
    }
  }

  /**
   * 增加用户配额并自动恢复规则
   */
  async increaseQuotaAndRestoreRules(additionalGB) {
    try {
      console.log(`\n📈 增加用户配额并自动恢复规则...`);

      // 1. 增加用户配额
      const user = await User.findByPk(this.testUserId);
      const newQuota = user.trafficQuota + additionalGB;
      await user.update({ trafficQuota: newQuota });

      console.log(`✅ 用户配额已增加: ${user.trafficQuota}GB → ${newQuota}GB (+${additionalGB}GB)`);

      // 2. 检查是否需要恢复规则
      const quotaBytes = newQuota * 1024 * 1024 * 1024;
      const usedBytes = user.usedTraffic || 0;
      const usagePercentage = (usedBytes / quotaBytes) * 100;

      console.log(`📊 当前使用率: ${usagePercentage.toFixed(1)}%`);

      if (usagePercentage < 100) {
        // 配额充足，恢复被禁用的规则
        const disabledRules = await UserForwardRule.findAll({
          where: { 
            userId: this.testUserId,
            isActive: false
          }
        });

        let restoredCount = 0;
        for (const rule of disabledRules) {
          if (rule.description && rule.description.includes('自动禁用')) {
            const cleanDescription = rule.description
              .replace(/\[实时监控自动禁用:.*?\]/g, '')
              .replace(/\[紧急控制:.*?\]/g, '')
              .replace(/\[紧急禁用:.*?\]/g, '')
              .trim();

            await rule.update({
              isActive: true,
              description: cleanDescription || null
            });

            console.log(`✅ 已恢复规则 ${rule.id}: ${rule.name} - 端口${rule.sourcePort}`);
            restoredCount++;
          }
        }

        console.log(`\n📊 恢复结果: 共恢复 ${restoredCount} 个规则`);

        // 触发GOST配置同步
        if (restoredCount > 0) {
          console.log(`🔄 触发GOST配置同步...`);
          const gostSyncCoordinator = require('./services/gostSyncCoordinator');
          await gostSyncCoordinator.requestSync('quota_increase_restore', true, 10);
          console.log(`✅ GOST配置同步已触发`);
        }

        return { restoredCount };
      } else {
        console.log(`⚠️ 配额仍不足，暂不恢复规则`);
        return { restoredCount: 0 };
      }

    } catch (error) {
      console.error('❌ 增加配额和恢复失败:', error);
      throw error;
    }
  }

  /**
   * 运行完整的修复流程
   */
  async runCompleteFix() {
    try {
      console.log('🚀 开始配额重置后自动恢复转发规则修复\n');

      // 1. 检查当前状态
      const status = await this.checkCurrentStatus();

      if (!status.hasIssue) {
        console.log('\n✅ 当前状态正常，无需修复');
        return;
      }

      // 2. 演示重置流量并恢复规则
      console.log('\n🧪 演示1: 重置流量并自动恢复规则');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      const resetResult = await this.resetTrafficAndRestoreRules(0.5);

      // 等待同步
      await this.sleep(3000);

      // 3. 验证恢复效果
      console.log('\n🔍 验证恢复效果...');
      await this.checkCurrentStatus();

      console.log('\n🧪 演示2: 增加配额并自动恢复规则');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // 先模拟超配额状态
      const user = await User.findByPk(this.testUserId);
      await user.update({ usedTraffic: 0.6 * 1024 * 1024 * 1024 }); // 600MB
      console.log('📊 模拟超配额状态: 600MB/500MB');

      // 然后增加配额
      const increaseResult = await this.increaseQuotaAndRestoreRules(1); // 增加1GB

      console.log('\n🎉 修复完成！');
      console.log('\n📋 修复总结:');
      console.log(`   - 重置流量恢复规则: ${resetResult.restoredCount}个`);
      console.log(`   - 增加配额恢复规则: ${increaseResult.restoredCount}个`);
      console.log(`   - 系统现在会在配额充足时自动恢复规则`);

    } catch (error) {
      console.error('❌ 修复流程失败:', error);
      throw error;
    }
  }

  /**
   * 延迟函数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 运行修复
async function runFix() {
  const fixer = new AutoRestoreRulesFixer();
  
  try {
    await fixer.runCompleteFix();
  } catch (error) {
    console.error('❌ 修复运行失败:', error);
  }
  
  process.exit(0);
}

// 启动修复
runFix();
