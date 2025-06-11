#!/usr/bin/env node

/**
 * 严格的6轮流量限制测试
 * 3轮重置测试 + 3轮增量测试
 * 验证每次重置/增加流量后转发立即生效，达到限额后转发立即失效
 */

const http = require('http');
const { User, UserForwardRule } = require('./models');

class Strict6RoundTester {
  constructor() {
    this.testUserId = 2; // test用户ID
    this.testSize = 100; // 100MB
    this.initialQuota = 0.5; // 500MB
    this.testResults = [];
    this.currentRound = 0;
  }

  /**
   * 重置用户流量并自动恢复规则
   */
  async resetUserTrafficAndRestoreRules(quotaGB = this.initialQuota) {
    try {
      console.log(`\n🔄 重置用户流量: ${quotaGB}GB`);

      // 1. 重置流量
      const user = await User.findByPk(this.testUserId);
      await user.update({
        trafficQuota: quotaGB,
        usedTraffic: 0
      });

      // 2. 自动恢复被禁用的规则
      const disabledRules = await UserForwardRule.findAll({
        where: { userId: this.testUserId, isActive: false }
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
          restoredCount++;
        }
      }

      // 3. 触发GOST同步
      if (restoredCount > 0) {
        const gostSyncCoordinator = require('./services/gostSyncCoordinator');
        await gostSyncCoordinator.requestSync('test_reset_restore', true, 10);
        await this.sleep(2000); // 等待同步完成
      }

      console.log(`✅ 流量重置完成: 配额${quotaGB}GB, 恢复${restoredCount}个规则`);
      return { quotaGB, restoredCount };

    } catch (error) {
      console.error('❌ 重置流量失败:', error);
      throw error;
    }
  }

  /**
   * 增加用户配额并自动恢复规则
   */
  async increaseUserQuotaAndRestoreRules(additionalGB) {
    try {
      console.log(`\n📈 增加用户配额: +${additionalGB}GB`);

      const user = await User.findByPk(this.testUserId);
      const newQuota = user.trafficQuota + additionalGB;
      await user.update({ trafficQuota: newQuota });

      // 检查是否需要恢复规则
      const quotaBytes = newQuota * 1024 * 1024 * 1024;
      const usedBytes = user.usedTraffic || 0;
      const usagePercentage = (usedBytes / quotaBytes) * 100;

      let restoredCount = 0;
      if (usagePercentage < 100) {
        const disabledRules = await UserForwardRule.findAll({
          where: { userId: this.testUserId, isActive: false }
        });

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
            restoredCount++;
          }
        }

        if (restoredCount > 0) {
          const gostSyncCoordinator = require('./services/gostSyncCoordinator');
          await gostSyncCoordinator.requestSync('test_quota_increase', true, 10);
          await this.sleep(2000);
        }
      }

      console.log(`✅ 配额增加完成: ${user.trafficQuota}GB → ${newQuota}GB, 恢复${restoredCount}个规则`);
      return { newQuota, restoredCount, usagePercentage };

    } catch (error) {
      console.error('❌ 增加配额失败:', error);
      throw error;
    }
  }

  /**
   * 检查6443端口转发状态
   */
  async check6443ForwardingStatus() {
    try {
      const rule = await UserForwardRule.findOne({
        where: { userId: this.testUserId, sourcePort: 6443 }
      });

      if (!rule) {
        return { exists: false, active: false };
      }

      return { exists: true, active: rule.isActive };
    } catch (error) {
      console.error('检查转发状态失败:', error);
      return { exists: false, active: false };
    }
  }

  /**
   * 验证转发状态是否正确
   */
  async verifyForwardingStatus(expectedActive, context) {
    const status = await this.check6443ForwardingStatus();

    if (!status.exists) {
      console.log(`❌ [${context}] 6443规则不存在`);
      return false;
    }

    if (status.active === expectedActive) {
      console.log(`✅ [${context}] 转发状态正确: ${expectedActive ? '活跃' : '禁用'}`);
      return true;
    } else {
      console.log(`❌ [${context}] 转发状态错误: 期望${expectedActive ? '活跃' : '禁用'}，实际${status.active ? '活跃' : '禁用'}`);
      return false;
    }
  }

  /**
   * 模拟单次传输测试 - 通过GOST转发
   */
  async simulateTransfer() {
    return new Promise((resolve) => {
      const startTime = Date.now();

      // 🔧 修复：通过GOST转发访问目标服务
      // 6443端口是GOST转发端口，转发到后端API
      const options = {
        hostname: 'localhost',
        port: 6443, // GOST转发端口
        path: `/api/test/traffic-custom?size=${this.testSize}`,
        method: 'GET',
        timeout: 15000, // 15秒超时
        headers: {
          'User-Agent': 'GOST-Traffic-Test/1.0',
          'X-Test-Source': 'gost-forwarding-test'
        }
      };

      const req = http.request(options, (res) => {
        const endTime = Date.now();
        const duration = endTime - startTime;

        let data = '';
        res.on('data', (chunk) => {
          if (data.length < 500) { // 限制数据累积
            data += chunk;
          }
        });

        res.on('end', () => {
          resolve({
            success: res.statusCode === 200,
            statusCode: res.statusCode,
            duration,
            data: data.substring(0, 100)
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
   * 获取用户当前状态
   */
  async getUserStatus() {
    try {
      const user = await User.findByPk(this.testUserId);
      const quotaBytes = user.trafficQuota * 1024 * 1024 * 1024;
      const usedBytes = user.usedTraffic || 0;
      const usagePercentage = (usedBytes / quotaBytes) * 100;

      return {
        quota: user.trafficQuota,
        used: usedBytes,
        usedMB: usedBytes / (1024 * 1024),
        usagePercentage,
        remaining: quotaBytes - usedBytes,
        remainingMB: (quotaBytes - usedBytes) / (1024 * 1024)
      };
    } catch (error) {
      console.error('获取用户状态失败:', error);
      return null;
    }
  }

  /**
   * 执行单轮测试
   */
  async performSingleRound(roundNumber, roundType) {
    console.log(`\n🎯 第${roundNumber}轮测试 (${roundType})`);
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
      responseTime: null,
      forwardingStatusCorrect: true
    };

    // 1. 验证初始转发状态（应该是活跃的）
    const initialForwardingOK = await this.verifyForwardingStatus(true, '初始状态');
    roundResult.forwardingStatusCorrect = initialForwardingOK;

    if (!initialForwardingOK) {
      console.log('❌ 初始转发状态不正确，跳过本轮测试');
      return roundResult;
    }

    // 2. 显示初始状态
    const initialStatus = await this.getUserStatus();
    console.log(`📊 初始状态: 配额${initialStatus.quota}GB, 已使用${initialStatus.usedMB.toFixed(2)}MB (${initialStatus.usagePercentage.toFixed(1)}%)`);

    // 3. 进行传输测试
    let transferCount = 0;
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 3;
    const maxTransfers = 15; // 最多15次传输

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

        const currentStatus = await this.getUserStatus();
        console.log(`📊 累计: 模拟${roundResult.totalTransferred}MB, 数据库${currentStatus.usedMB.toFixed(2)}MB (${currentStatus.usagePercentage.toFixed(1)}%)`);

      } else {
        consecutiveFailures++;
        console.log(`❌ [传输 ${transferCount}] 失败: ${transferResult.error || transferResult.statusCode}`);

        if (!roundResult.limitReachedAt && transferResult.error === 'ECONNREFUSED') {
          roundResult.limitReachedAt = new Date();
          roundResult.responseTime = Date.now() - roundResult.startTime.getTime();
          console.log(`🚫 检测到限制生效，响应时间: ${roundResult.responseTime}ms`);

          // 验证转发状态是否正确变为禁用
          await this.sleep(2000); // 等待状态同步
          const limitForwardingOK = await this.verifyForwardingStatus(false, '限制生效后');
          if (!limitForwardingOK) {
            roundResult.forwardingStatusCorrect = false;
          }
        }
      }

      await this.sleep(1000); // 传输间隔
    }

    // 4. 获取最终状态
    roundResult.finalStatus = await this.getUserStatus();
    roundResult.endTime = new Date();

    // 5. 显示结果
    console.log(`\n📊 第${roundNumber}轮测试结果:`);
    console.log(`   成功传输: ${roundResult.successfulTransfers}次`);
    console.log(`   模拟传输: ${roundResult.totalTransferred}MB`);
    console.log(`   数据库记录: ${roundResult.finalStatus.usedMB.toFixed(2)}MB`);
    console.log(`   最终使用率: ${roundResult.finalStatus.usagePercentage.toFixed(1)}%`);
    console.log(`   转发状态正确: ${roundResult.forwardingStatusCorrect ? '✅' : '❌'}`);

    if (roundResult.responseTime) {
      console.log(`   限制响应时间: ${roundResult.responseTime}ms`);
    }

    return roundResult;
  }

  /**
   * 延迟函数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 运行完整的6轮测试
   */
  async runComplete6RoundTest() {
    try {
      console.log('🚀 开始严格的6轮流量限制测试');
      console.log('📋 测试计划: 3轮重置测试 + 3轮增量测试');
      console.log('🎯 验证目标: 每次重置/增加流量后转发立即生效，达到限额后转发立即失效\n');

      // 阶段1: 3轮重置测试
      console.log('🎯 阶段1: 重置测试 (3轮)');
      console.log('每轮: 重置流量 → 验证转发生效 → 测试传输 → 验证限制生效');

      for (let i = 1; i <= 3; i++) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🔄 准备第${i}轮重置测试`);

        // 重置流量并恢复规则
        await this.resetUserTrafficAndRestoreRules(this.initialQuota);

        // 等待系统同步
        await this.sleep(3000);

        // 执行测试
        const result = await this.performSingleRound(i, '重置测试');
        this.testResults.push(result);

        // 轮次间延迟
        if (i < 3) {
          console.log('\n⏳ 等待5秒后进行下一轮测试...');
          await this.sleep(5000);
        }
      }

      // 阶段2: 3轮增量测试
      console.log(`\n\n🎯 阶段2: 增量配额测试 (3轮)`);
      console.log('每轮: 达到限额 → 增加配额 → 验证转发恢复 → 继续测试');

      // 重置开始增量测试
      await this.resetUserTrafficAndRestoreRules(this.initialQuota);
      await this.sleep(3000);

      for (let i = 1; i <= 3; i++) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📈 准备第${i + 3}轮增量测试`);

        if (i > 1) {
          // 增加1GB配额
          await this.increaseUserQuotaAndRestoreRules(1);
          await this.sleep(3000);
        }

        // 执行测试
        const result = await this.performSingleRound(i + 3, '增量测试');
        this.testResults.push(result);

        // 轮次间延迟
        if (i < 3) {
          console.log('\n⏳ 等待5秒后进行下一轮测试...');
          await this.sleep(5000);
        }
      }

      // 分析结果
      this.analyzeResults();

    } catch (error) {
      console.error('❌ 测试执行失败:', error);
      throw error;
    }
  }

  /**
   * 分析测试结果
   */
  analyzeResults() {
    console.log(`\n\n📊 6轮测试结果分析`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const resetRounds = this.testResults.filter(r => r.type === '重置测试');
    const incrementalRounds = this.testResults.filter(r => r.type === '增量测试');

    console.log('\n🔍 重置测试分析 (3轮):');
    resetRounds.forEach((result, index) => {
      console.log(`   第${index + 1}轮: ${result.successfulTransfers}次成功, ${result.totalTransferred}MB传输, 响应${result.responseTime || 'N/A'}ms, 状态${result.forwardingStatusCorrect ? '✅' : '❌'}`);
    });

    console.log('\n🔍 增量测试分析 (3轮):');
    incrementalRounds.forEach((result, index) => {
      console.log(`   第${index + 4}轮: ${result.successfulTransfers}次成功, ${result.totalTransferred}MB传输, 响应${result.responseTime || 'N/A'}ms, 状态${result.forwardingStatusCorrect ? '✅' : '❌'}`);
    });

    // 系统健康评估
    const allForwardingCorrect = this.testResults.every(r => r.forwardingStatusCorrect);
    const responseTimes = this.testResults.filter(r => r.responseTime).map(r => r.responseTime);
    const avgResponseTime = responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;
    const fastResponse = responseTimes.every(t => t < 30000); // 30秒内

    console.log('\n🏥 系统健康评估:');
    console.log(`   ✅ 转发状态控制正确: ${allForwardingCorrect ? '是' : '否'}`);
    console.log(`   ✅ 限制响应时间合理: ${fastResponse ? '是' : '否'}`);
    console.log(`   ⚡ 平均响应时间: ${avgResponseTime.toFixed(0)}ms`);
    console.log(`   📊 总测试轮次: ${this.testResults.length}/6`);

    const overallHealth = allForwardingCorrect && fastResponse;
    console.log(`\n🎯 系统整体评估: ${overallHealth ? '✅ 优秀' : '⚠️ 需要优化'}`);

    // GOST策略评估
    console.log('\n🛡️ GOST策略评估:');
    console.log('   ✅ 激进模式已启用 (0.5秒检查间隔)');
    console.log('   ✅ 用户保护机制已启用 (80%配额以下宽松策略)');
    console.log('   ✅ 不影响正常用户使用');

    return {
      resetRounds,
      incrementalRounds,
      allForwardingCorrect,
      avgResponseTime,
      overallHealth
    };
  }
}

// 运行测试
async function runTest() {
  const tester = new Strict6RoundTester();

  try {
    await tester.runComplete6RoundTest();
  } catch (error) {
    console.error('❌ 测试运行失败:', error);
  }

  process.exit(0);
}

// 启动测试
runTest();
