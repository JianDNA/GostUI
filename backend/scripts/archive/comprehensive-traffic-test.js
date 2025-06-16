#!/usr/bin/env node

/**
 * 全面的流量限制测试脚本
 * 包含3轮基础测试 + 3轮增量配额测试
 */

const http = require('http');
const { User, UserForwardRule } = require('./models');

class ComprehensiveTrafficTester {
  constructor() {
    this.baseUrl = 'http://localhost:6443';
    this.testSize = 100; // 100MB
    this.initialQuota = 0.5; // 500MB
    this.testResults = [];
    this.currentRound = 0;
    this.totalRounds = 6; // 3轮基础 + 3轮增量
  }

  /**
   * 重置test用户流量并自动恢复规则
   */
  async resetUserTraffic(quota = this.initialQuota) {
    try {
      const user = await User.findOne({ where: { username: 'test' } });
      if (!user) {
        throw new Error('未找到test用户');
      }

      await user.update({
        trafficQuota: quota,
        usedTraffic: 0
      });

      console.log(`✅ test用户已重置: 配额${quota}GB, 已使用0MB`);

      // 🔧 新增：自动恢复被配额禁用的规则
      await this.autoRestoreDisabledRules();

      return user;
    } catch (error) {
      console.error('❌ 重置用户流量失败:', error);
      throw error;
    }
  }

  /**
   * 增加用户配额并自动恢复规则
   */
  async increaseUserQuota(additionalGB) {
    try {
      const user = await User.findOne({ where: { username: 'test' } });
      if (!user) {
        throw new Error('未找到test用户');
      }

      const newQuota = user.trafficQuota + additionalGB;
      await user.update({ trafficQuota: newQuota });

      console.log(`📈 用户配额已增加: ${user.trafficQuota}GB → ${newQuota}GB (+${additionalGB}GB)`);

      // 🔧 新增：检查是否需要恢复规则
      const quotaBytes = newQuota * 1024 * 1024 * 1024;
      const usedBytes = user.usedTraffic || 0;
      const usagePercentage = (usedBytes / quotaBytes) * 100;

      if (usagePercentage < 100) {
        console.log(`📊 配额充足 (${usagePercentage.toFixed(1)}%)，自动恢复规则...`);
        await this.autoRestoreDisabledRules();
      } else {
        console.log(`⚠️ 配额仍不足 (${usagePercentage.toFixed(1)}%)，暂不恢复规则`);
      }

      return user;
    } catch (error) {
      console.error('❌ 增加用户配额失败:', error);
      throw error;
    }
  }

  /**
   * 🔧 新增：自动恢复被配额禁用的规则
   */
  async autoRestoreDisabledRules() {
    try {
      const disabledRules = await UserForwardRule.findAll({
        where: {
          userId: 2, // test用户ID
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

          console.log(`🔄 已恢复规则 ${rule.id}: ${rule.name} - 端口${rule.sourcePort}`);
          restoredCount++;
        }
      }

      if (restoredCount > 0) {
        console.log(`✅ 共恢复 ${restoredCount} 个规则`);

        // 触发GOST配置同步
        try {
          const gostSyncCoordinator = require('./services/gostSyncCoordinator');
          await gostSyncCoordinator.requestSync('auto_restore_rules', true, 10);
          console.log(`🔄 GOST配置同步已触发`);
        } catch (error) {
          console.log(`⚠️ GOST同步触发失败: ${error.message}`);
        }
      } else {
        console.log(`ℹ️ 没有需要恢复的规则`);
      }

      return restoredCount;
    } catch (error) {
      console.error('❌ 自动恢复规则失败:', error);
      return 0;
    }
  }

  /**
   * 获取用户当前状态
   */
  async getUserStatus() {
    try {
      const user = await User.findOne({ where: { username: 'test' } });
      if (!user) return null;

      const quotaBytes = user.trafficQuota * 1024 * 1024 * 1024;
      const usedBytes = user.usedTraffic || 0;
      const usagePercentage = (usedBytes / quotaBytes) * 100;

      return {
        quota: user.trafficQuota,
        used: usedBytes,
        usedMB: usedBytes / (1024 * 1024),
        usagePercentage: usagePercentage,
        remaining: quotaBytes - usedBytes,
        remainingMB: (quotaBytes - usedBytes) / (1024 * 1024)
      };
    } catch (error) {
      console.error('获取用户状态失败:', error);
      return null;
    }
  }

  /**
   * 检查6443规则状态
   */
  async check6443RuleStatus() {
    try {
      const rule = await UserForwardRule.findOne({
        where: {
          userId: 2, // test用户ID
          sourcePort: 6443
        }
      });

      if (!rule) {
        console.log('⚠️ 未找到6443端口规则');
        return false;
      }

      console.log(`📋 6443规则状态: ${rule.isActive ? '✅ 活跃' : '❌ 禁用'}`);
      return rule.isActive;
    } catch (error) {
      console.error('检查规则状态失败:', error);
      return false;
    }
  }

  /**
   * 模拟单次传输测试
   */
  async simulateTransfer() {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const options = {
        hostname: 'localhost',
        port: 6443,
        path: `/api/test/traffic-custom?size=${this.testSize}`,
        method: 'GET',
        timeout: 30000
      };

      const req = http.request(options, (res) => {
        const endTime = Date.now();
        const duration = endTime - startTime;

        let data = '';
        res.on('data', (chunk) => {
          // 🔧 优化：限制数据累积，避免内存泄漏
          if (data.length < 1000) {
            data += chunk;
          }
        });

        res.on('end', () => {
          resolve({
            success: res.statusCode === 200,
            statusCode: res.statusCode,
            duration,
            data: data.substring(0, 200) // 只保留前200字符
          });
        });
      });

      req.on('error', (error) => {
        resolve({
          success: false,
          error: error.code || error.message,
          duration: Date.now() - startTime
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          error: 'TIMEOUT',
          duration: Date.now() - startTime
        });
      });

      req.end();
    });
  }

  /**
   * 执行单轮测试
   */
  async performSingleRound(roundType, roundNumber) {
    console.log(`\n🔄 开始第${roundNumber}轮${roundType}测试`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const roundResult = {
      round: roundNumber,
      type: roundType,
      startTime: new Date(),
      transfers: [],
      totalTransferred: 0,
      successfulTransfers: 0,
      finalStatus: null,
      limitReachedAt: null,
      responseTime: null
    };

    // 检查初始状态
    const initialStatus = await this.getUserStatus();
    console.log(`📊 初始状态: 配额${initialStatus.quota}GB, 已使用${initialStatus.usedMB.toFixed(2)}MB (${initialStatus.usagePercentage.toFixed(1)}%)`);

    // 检查6443规则状态
    const ruleActive = await this.check6443RuleStatus();
    if (!ruleActive) {
      console.log('⚠️ 6443规则未激活，请先通过admin界面启用');
      roundResult.error = '6443规则未激活';
      return roundResult;
    }

    let transferCount = 0;
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 3;
    const maxTransfers = 20; // 最多20次传输

    while (consecutiveFailures < maxConsecutiveFailures && transferCount < maxTransfers) {
      transferCount++;
      console.log(`\n🔄 [传输 ${transferCount}] 开始${this.testSize}MB传输测试...`);

      const transferResult = await this.simulateTransfer();
      roundResult.transfers.push({
        number: transferCount,
        ...transferResult,
        timestamp: new Date()
      });

      if (transferResult.success) {
        consecutiveFailures = 0;
        roundResult.successfulTransfers++;
        roundResult.totalTransferred += this.testSize;

        console.log(`✅ [传输 ${transferCount}] 成功: ${this.testSize}MB, 耗时: ${transferResult.duration}ms`);

        // 检查当前状态
        const currentStatus = await this.getUserStatus();
        console.log(`📊 累计传输: ${roundResult.totalTransferred}MB, 数据库记录: ${currentStatus.usedMB.toFixed(2)}MB (${currentStatus.usagePercentage.toFixed(1)}%)`);

        // 检查是否接近限制
        if (currentStatus.usagePercentage >= 95) {
          console.log(`⚠️ 接近配额限制 (${currentStatus.usagePercentage.toFixed(1)}%)，继续测试...`);
        }

      } else {
        consecutiveFailures++;
        console.log(`❌ [传输 ${transferCount}] 失败: ${transferResult.error || transferResult.statusCode}`);

        // 记录首次限制时间
        if (!roundResult.limitReachedAt && transferResult.error === 'ECONNREFUSED') {
          roundResult.limitReachedAt = new Date();
          roundResult.responseTime = Date.now() - roundResult.startTime.getTime();
          console.log(`🚫 检测到限制生效，响应时间: ${roundResult.responseTime}ms`);
        }
      }

      // 短暂延迟
      await this.sleep(1000);
    }

    // 获取最终状态
    roundResult.finalStatus = await this.getUserStatus();
    roundResult.endTime = new Date();

    console.log(`\n📊 第${roundNumber}轮${roundType}测试结果:`);
    console.log(`   总传输次数: ${transferCount}`);
    console.log(`   成功传输: ${roundResult.successfulTransfers}`);
    console.log(`   模拟传输总量: ${roundResult.totalTransferred}MB`);
    console.log(`   数据库记录: ${roundResult.finalStatus.usedMB.toFixed(2)}MB`);
    console.log(`   最终使用率: ${roundResult.finalStatus.usagePercentage.toFixed(1)}%`);

    if (roundResult.responseTime) {
      console.log(`   限制响应时间: ${roundResult.responseTime}ms`);
    }

    return roundResult;
  }

  /**
   * 执行基础测试轮次
   */
  async performBasicRounds() {
    console.log('\n🎯 开始基础测试阶段 (3轮)');
    console.log('每轮测试: 重置用户流量 → 测试传输 → 分析结果');

    for (let i = 1; i <= 3; i++) {
      // 重置用户流量
      await this.resetUserTraffic(this.initialQuota);

      // 等待系统同步
      await this.sleep(3000);

      // 执行测试
      const result = await this.performSingleRound('基础', i);
      this.testResults.push(result);

      // 轮次间延迟
      if (i < 3) {
        console.log('\n⏳ 等待5秒后进行下一轮测试...');
        await this.sleep(5000);
      }
    }
  }

  /**
   * 执行增量配额测试轮次
   */
  async performIncrementalRounds() {
    console.log('\n🎯 开始增量配额测试阶段 (3轮)');
    console.log('每轮测试: 达到限额 → 增加1GB配额 → 继续测试');

    // 重置用户流量开始增量测试
    await this.resetUserTraffic(this.initialQuota);
    await this.sleep(3000);

    for (let i = 1; i <= 3; i++) {
      console.log(`\n🔄 增量测试第${i}轮`);

      if (i > 1) {
        // 增加1GB配额
        await this.increaseUserQuota(1);
        await this.sleep(3000);
      }

      // 执行测试
      const result = await this.performSingleRound('增量', i + 3);
      this.testResults.push(result);

      // 轮次间延迟
      if (i < 3) {
        console.log('\n⏳ 等待5秒后进行下一轮测试...');
        await this.sleep(5000);
      }
    }
  }

  /**
   * 分析测试结果
   */
  analyzeResults() {
    console.log('\n📊 测试结果分析');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const basicRounds = this.testResults.filter(r => r.type === '基础');
    const incrementalRounds = this.testResults.filter(r => r.type === '增量');

    console.log('\n🔍 基础测试分析:');
    basicRounds.forEach((result, index) => {
      console.log(`   第${index + 1}轮: ${result.successfulTransfers}次成功, ${result.totalTransferred}MB传输, 响应时间: ${result.responseTime || 'N/A'}ms`);
    });

    console.log('\n🔍 增量测试分析:');
    incrementalRounds.forEach((result, index) => {
      console.log(`   第${index + 1}轮: ${result.successfulTransfers}次成功, ${result.totalTransferred}MB传输, 响应时间: ${result.responseTime || 'N/A'}ms`);
    });

    // 计算平均响应时间
    const responseTimes = this.testResults
      .filter(r => r.responseTime)
      .map(r => r.responseTime);

    if (responseTimes.length > 0) {
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      console.log(`\n⚡ 平均限制响应时间: ${avgResponseTime.toFixed(0)}ms`);
    }

    // 系统健康评估
    console.log('\n🏥 系统健康评估:');

    const allSuccessful = this.testResults.every(r => r.successfulTransfers > 0);
    const fastResponse = responseTimes.every(t => t < 10000); // 10秒内
    const consistentBehavior = this.checkConsistentBehavior();

    console.log(`   ✅ 所有轮次都有成功传输: ${allSuccessful ? '是' : '否'}`);
    console.log(`   ✅ 限制响应时间 < 10秒: ${fastResponse ? '是' : '否'}`);
    console.log(`   ✅ 行为一致性: ${consistentBehavior ? '是' : '否'}`);

    const overallHealth = allSuccessful && fastResponse && consistentBehavior;
    console.log(`\n🎯 系统整体健康状态: ${overallHealth ? '✅ 良好' : '⚠️ 需要关注'}`);

    return {
      basicRounds,
      incrementalRounds,
      avgResponseTime: responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : null,
      overallHealth
    };
  }

  /**
   * 检查行为一致性
   */
  checkConsistentBehavior() {
    // 检查基础测试的一致性
    const basicRounds = this.testResults.filter(r => r.type === '基础');
    if (basicRounds.length < 2) return true;

    const successCounts = basicRounds.map(r => r.successfulTransfers);
    const maxDiff = Math.max(...successCounts) - Math.min(...successCounts);

    // 如果成功次数差异不超过2次，认为是一致的
    return maxDiff <= 2;
  }

  /**
   * 延迟函数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 运行完整测试
   */
  async runComprehensiveTest() {
    try {
      console.log('🚀 开始全面流量限制测试');
      console.log(`📋 测试参数: 单次${this.testSize}MB, 初始配额${this.initialQuota}GB`);
      console.log(`🎯 测试计划: 3轮基础测试 + 3轮增量配额测试`);

      // 执行基础测试
      await this.performBasicRounds();

      // 执行增量测试
      await this.performIncrementalRounds();

      // 分析结果
      const analysis = this.analyzeResults();

      console.log('\n🎉 全面测试完成！');
      return analysis;

    } catch (error) {
      console.error('❌ 测试执行失败:', error);
      throw error;
    }
  }
}

// 运行测试
async function runTest() {
  const tester = new ComprehensiveTrafficTester();

  try {
    await tester.runComprehensiveTest();
  } catch (error) {
    console.error('❌ 测试运行失败:', error);
  }

  process.exit(0);
}

// 启动测试
runTest();
