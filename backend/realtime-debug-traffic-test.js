#!/usr/bin/env node

/**
 * 实时调试流量限制测试
 *
 * 在测试过程中实时监控服务端日志，分析流量限制的执行问题
 * 重点关注：
 * 1. 流量统计更新的时机
 * 2. 配额检查的执行
 * 3. 规则禁用/恢复的时机
 * 4. GOST配置同步的延迟
 */

const { User, UserForwardRule } = require('./models');
const http = require('http');

class RealtimeDebugTrafficTester {
  constructor() {
    this.baseUrl = 'http://localhost:6443';
    this.testSize = 100; // 100MB per test
    this.initialQuota = 0.5; // 500MB
    this.testUserId = null;
    this.adminToken = null;
    this.testResults = [];
    this.debugLogs = [];
  }

  /**
   * HTTP请求辅助函数
   */
  async makeHttpRequest(method, url, data = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const responseData = body ? JSON.parse(body) : {};
            resolve({
              status: res.statusCode,
              data: responseData,
              headers: res.headers
            });
          } catch (error) {
            resolve({
              status: res.statusCode,
              data: body,
              headers: res.headers
            });
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  /**
   * 记录调试日志
   */
  log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${type}] ${message}`;
    console.log(logEntry);
    this.debugLogs.push(logEntry);
  }

  /**
   * 初始化测试环境
   */
  async initialize() {
    try {
      this.log('🔧 初始化实时调试测试环境...');

      // 1. 获取test用户
      const testUser = await User.findOne({ where: { username: 'test' } });
      if (!testUser) {
        throw new Error('未找到test用户，请先运行 node create-test-users.js');
      }
      this.testUserId = testUser.id;
      this.log(`✅ 找到test用户 (ID: ${this.testUserId})`);

      // 2. 获取管理员token
      try {
        const loginResponse = await this.makeHttpRequest('POST', 'http://localhost:3000/api/auth/login', {
          username: 'admin',
          password: 'admin123'
        });
        if (loginResponse.status === 200 && loginResponse.data.token) {
          this.adminToken = loginResponse.data.token;
          this.log('✅ 获取管理员token成功');
        } else {
          this.log('⚠️ 登录失败，将使用直接数据库操作', 'WARN');
        }
      } catch (error) {
        this.log('⚠️ 无法获取管理员token，将使用直接数据库操作', 'WARN');
      }

      // 3. 检查转发规则
      const rules = await UserForwardRule.findAll({
        where: { userId: this.testUserId }
      });
      this.log(`✅ 找到 ${rules.length} 个转发规则`);

      this.log('🎯 实时调试测试环境初始化完成\n');
    } catch (error) {
      this.log(`❌ 初始化失败: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  /**
   * 重置用户流量并自动恢复规则
   */
  async resetUserTrafficAndRestoreRules(quotaGB = this.initialQuota) {
    try {
      this.log(`\n🔄 [RESET] 重置用户流量: ${quotaGB}GB`);

      // 1. 重置流量
      const user = await User.findByPk(this.testUserId);
      const oldUsedTraffic = user.usedTraffic || 0;

      await user.update({
        trafficQuota: quotaGB,
        usedTraffic: 0
      });

      this.log(`✅ [RESET] 流量已重置: ${(oldUsedTraffic/1024/1024).toFixed(1)}MB → 0MB, 配额: ${quotaGB}GB`);

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
          this.log(`✅ [RESET] 恢复规则 ${rule.id}: ${rule.name} (端口${rule.sourcePort})`);
        }
      }

      if (restoredCount > 0) {
        this.log(`✅ [RESET] 自动恢复了 ${restoredCount} 个被禁用的规则`);
      }

      // 3. 触发配置同步
      await this.triggerConfigSync('traffic_reset');
      this.log(`🔄 [RESET] 配置同步已触发`);

      // 4. 等待配置同步完成
      await this.sleep(3000);
      this.log(`⏳ [RESET] 等待配置同步完成 (3秒)`);

      return user;
    } catch (error) {
      this.log(`❌ [RESET] 重置用户流量失败: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  /**
   * 增加用户配额并自动恢复规则
   */
  async increaseUserQuotaAndRestoreRules(additionalGB) {
    try {
      this.log(`\n📈 [INCREASE] 增加用户配额: +${additionalGB}GB`);

      const user = await User.findByPk(this.testUserId);
      const oldQuota = user.trafficQuota;
      const newQuota = oldQuota + additionalGB;

      await user.update({ trafficQuota: newQuota });

      // 检查是否需要恢复规则
      const quotaBytes = newQuota * 1024 * 1024 * 1024;
      const usedBytes = user.usedTraffic || 0;
      const usagePercentage = (usedBytes / quotaBytes) * 100;

      this.log(`✅ [INCREASE] 配额已增加: ${oldQuota}GB → ${newQuota}GB (+${additionalGB}GB)`);
      this.log(`📊 [INCREASE] 当前使用率: ${usagePercentage.toFixed(1)}% (${(usedBytes/1024/1024).toFixed(1)}MB / ${(quotaBytes/1024/1024).toFixed(1)}MB)`);

      if (usagePercentage < 100) {
        // 自动恢复被禁用的规则
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
            this.log(`✅ [INCREASE] 恢复规则 ${rule.id}: ${rule.name} (端口${rule.sourcePort})`);
          }
        }

        if (restoredCount > 0) {
          this.log(`✅ [INCREASE] 自动恢复了 ${restoredCount} 个被禁用的规则`);
        }
      } else {
        this.log(`⚠️ [INCREASE] 配额仍不足，暂不恢复规则`, 'WARN');
      }

      // 触发配置同步
      await this.triggerConfigSync('quota_increase');
      this.log(`🔄 [INCREASE] 配置同步已触发`);

      // 等待配置同步完成
      await this.sleep(3000);
      this.log(`⏳ [INCREASE] 等待配置同步完成 (3秒)`);

      return user;
    } catch (error) {
      this.log(`❌ [INCREASE] 增加用户配额失败: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  /**
   * 触发配置同步
   */
  async triggerConfigSync(reason = 'test') {
    try {
      if (this.adminToken) {
        const response = await this.makeHttpRequest('POST', 'http://localhost:3000/api/gost-config/sync', {}, {
          Authorization: `Bearer ${this.adminToken}`
        });
        this.log(`🔄 [SYNC] 配置同步请求已发送 (${reason}), 状态: ${response.status}`);
      } else {
        this.log(`⚠️ [SYNC] 无管理员token，跳过配置同步`, 'WARN');
      }
    } catch (error) {
      this.log(`⚠️ [SYNC] 配置同步失败: ${error.message}`, 'WARN');
    }
  }

  /**
   * 等待指定时间
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 执行流量测试并实时监控
   */
  async performTrafficTestWithMonitoring(testName, expectedSuccess = true) {
    const startTime = Date.now();
    let success = false;
    let actualSize = 0;
    let error = null;
    let beforeStatus = null;
    let beforeRules = null;

    try {
      this.log(`\n🧪 [TEST] 开始流量测试: ${testName} (${this.testSize}MB)`);

      // 测试前检查用户状态
      beforeStatus = await this.getUserStatus();
      this.log(`📊 [TEST] 测试前状态: ${beforeStatus.usedMB.toFixed(1)}MB / ${beforeStatus.quotaMB.toFixed(1)}MB (${beforeStatus.usagePercentage.toFixed(1)}%)`);

      // 检查规则状态
      beforeRules = await this.checkForwardRulesStatus();
      this.log(`📊 [TEST] 测试前规则: ${beforeRules.active}个激活, ${beforeRules.inactive}个禁用`);

      const response = await this.makeHttpRequest(
        'GET',
        `${this.baseUrl}/api/test/traffic-custom?size=${this.testSize}`
      );

      if (response.status === 200 && response.data) {
        success = true;
        actualSize = response.data.actualSize || this.testSize;
        this.log(`✅ [TEST] 测试成功: 传输了 ${actualSize}MB`);
      } else {
        this.log(`❌ [TEST] 测试失败: HTTP ${response.status}`);
      }
    } catch (err) {
      error = err.message;
      this.log(`❌ [TEST] 测试失败: ${error}`);
    }

    const duration = Date.now() - startTime;

    // 测试后立即检查状态变化
    this.log(`⏳ [TEST] 等待2秒后检查状态变化...`);
    await this.sleep(2000);

    const afterStatus = await this.getUserStatus();
    const afterRules = await this.checkForwardRulesStatus();

    this.log(`📊 [TEST] 测试后状态: ${afterStatus.usedMB.toFixed(1)}MB / ${afterStatus.quotaMB.toFixed(1)}MB (${afterStatus.usagePercentage.toFixed(1)}%)`);
    this.log(`📊 [TEST] 测试后规则: ${afterRules.active}个激活, ${afterRules.inactive}个禁用`);

    // 分析状态变化
    const trafficIncrease = beforeStatus && afterStatus ? afterStatus.usedMB - beforeStatus.usedMB : 0;
    const rulesChanged = beforeRules && afterRules ?
      (beforeRules.active !== afterRules.active || beforeRules.inactive !== afterRules.inactive) : false;

    this.log(`📈 [TEST] 流量增长: ${trafficIncrease.toFixed(1)}MB`);
    if (rulesChanged) {
      this.log(`🔄 [TEST] 规则状态发生变化: ${beforeRules.active}→${afterRules.active}激活, ${beforeRules.inactive}→${afterRules.inactive}禁用`);
    }

    const result = {
      testName,
      expectedSuccess,
      actualSuccess: success,
      actualSize,
      duration,
      error,
      beforeStatus,
      afterStatus,
      trafficIncrease,
      rulesChanged,
      timestamp: new Date().toISOString()
    };

    // 验证结果是否符合预期
    if (success === expectedSuccess) {
      this.log(`✅ [TEST] 结果符合预期: ${expectedSuccess ? '成功' : '失败'}`);
    } else {
      this.log(`❌ [TEST] 结果不符合预期: 期望${expectedSuccess ? '成功' : '失败'}，实际${success ? '成功' : '失败'}`, 'ERROR');
    }

    return result;
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
        quotaMB: user.trafficQuota * 1024,
        used: usedBytes,
        usedMB: usedBytes / (1024 * 1024),
        usagePercentage,
        remaining: quotaBytes - usedBytes,
        remainingMB: (quotaBytes - usedBytes) / (1024 * 1024)
      };
    } catch (error) {
      this.log(`❌ [STATUS] 获取用户状态失败: ${error.message}`, 'ERROR');
      return null;
    }
  }

  /**
   * 检查转发规则状态
   */
  async checkForwardRulesStatus() {
    try {
      const rules = await UserForwardRule.findAll({
        where: { userId: this.testUserId }
      });

      const activeRules = rules.filter(r => r.isActive);
      const inactiveRules = rules.filter(r => !r.isActive);

      return {
        total: rules.length,
        active: activeRules.length,
        inactive: inactiveRules.length,
        rules: rules.map(r => ({
          id: r.id,
          name: r.name,
          port: r.sourcePort,
          active: r.isActive,
          description: r.description
        }))
      };
    } catch (error) {
      this.log(`❌ [RULES] 检查转发规则状态失败: ${error.message}`, 'ERROR');
      return null;
    }
  }

  /**
   * 执行单轮测试（重置测试）
   */
  async performResetRound(roundNumber) {
    this.log(`\n${'='.repeat(80)}`);
    this.log(`🔄 [ROUND ${roundNumber}] 重置流量测试开始`);
    this.log(`${'='.repeat(80)}`);

    const roundResult = {
      roundNumber,
      type: 'reset',
      tests: [],
      startTime: new Date().toISOString()
    };

    try {
      // 1. 重置用户流量
      await this.resetUserTrafficAndRestoreRules(this.initialQuota);

      // 2. 执行流量测试直到达到限额
      let testCount = 0;
      let limitReached = false;

      while (testCount < 10 && !limitReached) { // 最多10次测试
        testCount++;

        // 检查当前状态
        const currentStatus = await this.getUserStatus();

        if (currentStatus.usagePercentage >= 100) {
          this.log(`🚫 [ROUND ${roundNumber}] 已达到流量限额，测试转发是否被阻止...`);

          // 测试转发是否被阻止
          const blockTest = await this.performTrafficTestWithMonitoring(`重置-R${roundNumber}-限额阻止测试`, false);
          roundResult.tests.push(blockTest);

          limitReached = true;
          break;
        }

        // 继续测试
        const continueTest = await this.performTrafficTestWithMonitoring(`重置-R${roundNumber}-测试${testCount}`, true);
        roundResult.tests.push(continueTest);

        if (!continueTest.actualSuccess) {
          this.log(`🚫 [ROUND ${roundNumber}] 转发被阻止，可能已达到限额`);
          limitReached = true;
          break;
        }

        // 短暂等待，观察系统反应
        await this.sleep(1000);
      }

      roundResult.limitReached = limitReached;
      roundResult.endTime = new Date().toISOString();

      this.log(`🎯 [ROUND ${roundNumber}] 重置测试完成: 执行了${roundResult.tests.length}次测试, 达到限额: ${limitReached}`);

    } catch (error) {
      this.log(`❌ [ROUND ${roundNumber}] 测试失败: ${error.message}`, 'ERROR');
      roundResult.error = error.message;
    }

    return roundResult;
  }

  /**
   * 执行单轮测试（增量测试）
   */
  async performIncrementalRound(roundNumber) {
    this.log(`\n${'='.repeat(80)}`);
    this.log(`📈 [ROUND ${roundNumber}] 增量配额测试开始`);
    this.log(`${'='.repeat(80)}`);

    const roundResult = {
      roundNumber,
      type: 'incremental',
      tests: [],
      startTime: new Date().toISOString()
    };

    try {
      // 1. 增加1GB配额
      await this.increaseUserQuotaAndRestoreRules(1);

      // 2. 执行流量测试直到达到限额
      let testCount = 0;
      let limitReached = false;

      while (testCount < 10 && !limitReached) { // 最多10次测试
        testCount++;

        // 检查当前状态
        const currentStatus = await this.getUserStatus();

        if (currentStatus.usagePercentage >= 100) {
          this.log(`🚫 [ROUND ${roundNumber}] 已达到流量限额，测试转发是否被阻止...`);

          // 测试转发是否被阻止
          const blockTest = await this.performTrafficTestWithMonitoring(`增量-R${roundNumber}-限额阻止测试`, false);
          roundResult.tests.push(blockTest);

          limitReached = true;
          break;
        }

        // 继续测试
        const continueTest = await this.performTrafficTestWithMonitoring(`增量-R${roundNumber}-测试${testCount}`, true);
        roundResult.tests.push(continueTest);

        if (!continueTest.actualSuccess) {
          this.log(`🚫 [ROUND ${roundNumber}] 转发被阻止，可能已达到限额`);
          limitReached = true;
          break;
        }

        // 短暂等待，观察系统反应
        await this.sleep(1000);
      }

      roundResult.limitReached = limitReached;
      roundResult.endTime = new Date().toISOString();

      this.log(`🎯 [ROUND ${roundNumber}] 增量测试完成: 执行了${roundResult.tests.length}次测试, 达到限额: ${limitReached}`);

    } catch (error) {
      this.log(`❌ [ROUND ${roundNumber}] 测试失败: ${error.message}`, 'ERROR');
      roundResult.error = error.message;
    }

    return roundResult;
  }

  /**
   * 执行完整的6轮测试
   */
  async runFullTest() {
    try {
      this.log('🚀 开始实时调试流量限制测试');
      this.log('🎯 测试目标: 实时监控流量限制执行过程，分析延迟问题');

      // 初始化
      await this.initialize();

      // 执行前3轮重置测试
      this.log('\n🔄 开始重置流量测试阶段 (3轮)');
      for (let i = 1; i <= 3; i++) {
        const result = await this.performResetRound(i);
        this.testResults.push(result);

        if (i < 3) {
          this.log('\n⏳ 等待5秒后进行下一轮测试...');
          await this.sleep(5000);
        }
      }

      // 执行后3轮增量测试
      this.log('\n📈 开始增量配额测试阶段 (3轮)');

      // 先重置用户流量开始增量测试
      await this.resetUserTrafficAndRestoreRules(this.initialQuota);

      for (let i = 4; i <= 6; i++) {
        const result = await this.performIncrementalRound(i);
        this.testResults.push(result);

        if (i < 6) {
          this.log('\n⏳ 等待5秒后进行下一轮测试...');
          await this.sleep(5000);
        }
      }

      // 生成分析报告
      this.generateAnalysisReport();

      this.log('\n🎉 实时调试测试完成！');

    } catch (error) {
      this.log(`❌ 测试执行失败: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  /**
   * 生成分析报告
   */
  generateAnalysisReport() {
    this.log('\n' + '='.repeat(100));
    this.log('📊 实时调试流量限制测试分析报告');
    this.log('='.repeat(100));

    let totalTests = 0;
    let successfulTests = 0;
    let expectedResults = 0;
    let trafficLimitIssues = [];
    let configSyncIssues = [];

    this.testResults.forEach((round, index) => {
      this.log(`\n🎯 第${round.roundNumber}轮 (${round.type}测试):`);
      this.log(`   开始时间: ${round.startTime}`);
      this.log(`   结束时间: ${round.endTime || '未完成'}`);
      this.log(`   测试次数: ${round.tests.length}`);
      this.log(`   达到限额: ${round.limitReached ? '是' : '否'}`);

      if (round.error) {
        this.log(`   ❌ 错误: ${round.error}`);
      }

      // 分析每个测试
      round.tests.forEach((test, testIndex) => {
        totalTests++;
        if (test.actualSuccess) successfulTests++;
        if (test.actualSuccess === test.expectedSuccess) expectedResults++;

        // 检查流量限制问题
        if (test.expectedSuccess === false && test.actualSuccess === true) {
          trafficLimitIssues.push({
            round: round.roundNumber,
            test: test.testName,
            issue: '达到限额后转发仍然成功',
            beforeUsage: test.beforeStatus?.usagePercentage,
            afterUsage: test.afterStatus?.usagePercentage
          });
        }

        // 检查配置同步问题
        if (test.expectedSuccess === true && test.actualSuccess === false) {
          configSyncIssues.push({
            round: round.roundNumber,
            test: test.testName,
            issue: '期望成功但转发失败',
            error: test.error
          });
        }

        this.log(`     测试${testIndex + 1}: ${test.testName} - ${test.actualSuccess ? '成功' : '失败'} (期望${test.expectedSuccess ? '成功' : '失败'})`);
        if (test.trafficIncrease > 0) {
          this.log(`       流量增长: ${test.trafficIncrease.toFixed(1)}MB`);
        }
        if (test.rulesChanged) {
          this.log(`       规则状态变化: 是`);
        }
      });
    });

    this.log('\n📈 总体统计:');
    this.log(`   总测试次数: ${totalTests}`);
    this.log(`   成功次数: ${successfulTests}`);
    this.log(`   符合预期: ${expectedResults}/${totalTests} (${((expectedResults/totalTests)*100).toFixed(1)}%)`);
    this.log(`   测试轮数: ${this.testResults.length}/6`);

    // 分析关键问题
    this.log('\n🔍 关键问题分析:');

    if (trafficLimitIssues.length > 0) {
      this.log(`\n❌ 流量限制执行问题 (${trafficLimitIssues.length}个):`);
      trafficLimitIssues.forEach(issue => {
        this.log(`   - 第${issue.round}轮: ${issue.issue}`);
        this.log(`     使用率: ${issue.beforeUsage?.toFixed(1)}% → ${issue.afterUsage?.toFixed(1)}%`);
      });
    }

    if (configSyncIssues.length > 0) {
      this.log(`\n❌ 配置同步问题 (${configSyncIssues.length}个):`);
      configSyncIssues.forEach(issue => {
        this.log(`   - 第${issue.round}轮: ${issue.issue}`);
        this.log(`     错误: ${issue.error}`);
      });
    }

    // 提供改进建议
    this.log('\n💡 改进建议:');

    if (trafficLimitIssues.length > 0) {
      this.log('   1. 流量限制实时性问题:');
      this.log('      - 减少实时监控检查间隔（当前0.5秒）');
      this.log('      - 优化流量统计更新机制');
      this.log('      - 实现更严格的GOST限制器策略');
    }

    if (configSyncIssues.length > 0) {
      this.log('   2. 配置同步延迟问题:');
      this.log('      - 优化GOST热重载机制');
      this.log('      - 减少配置同步延迟');
      this.log('      - 增加配置同步状态验证');
    }

    if (expectedResults === totalTests) {
      this.log('\n✅ 测试结果: 所有测试都符合预期，系统运行正常！');
    } else {
      this.log('\n❌ 测试结果: 发现系统问题，需要优化流量限制机制！');
    }

    this.log('\n' + '='.repeat(100));
  }
}

// 执行测试
if (require.main === module) {
  const tester = new RealtimeDebugTrafficTester();
  tester.runFullTest()
    .then(() => {
      console.log('✅ 实时调试测试脚本执行完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ 实时调试测试脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = RealtimeDebugTrafficTester;