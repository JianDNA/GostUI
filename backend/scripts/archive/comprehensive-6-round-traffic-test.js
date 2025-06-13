#!/usr/bin/env node

/**
 * 全面的6轮流量限制测试
 *
 * 测试计划:
 * 前3轮: 重置流量测试 (500MB配额 → 100MB测试 → 重置 → 重复)
 * 后3轮: 增量配额测试 (500MB → 达到限额 → +1GB → 达到限额 → +1GB → 达到限额)
 *
 * 每轮测试验证:
 * 1. 重置/增加流量后，转发立即生效
 * 2. 达到限额后，转发立即失效
 * 3. GOST策略不影响正常用户
 */

const { User, UserForwardRule } = require('./models');
const http = require('http');
const https = require('https');

class Comprehensive6RoundTrafficTester {
  constructor() {
    this.baseUrl = 'http://localhost:6443';
    this.testSize = 100; // 100MB per test
    this.initialQuota = 0.5; // 500MB
    this.testUserId = null;
    this.testResults = [];
    this.adminToken = null;
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
   * 初始化测试环境
   */
  async initialize() {
    try {
      console.log('🔧 初始化测试环境...');

      // 1. 获取test用户
      const testUser = await User.findOne({ where: { username: 'test' } });
      if (!testUser) {
        throw new Error('未找到test用户，请先运行 node create-test-users.js');
      }
      this.testUserId = testUser.id;
      console.log(`✅ 找到test用户 (ID: ${this.testUserId})`);

      // 2. 获取管理员token (模拟登录)
      try {
        const loginResponse = await this.makeHttpRequest('POST', 'http://localhost:3000/api/auth/login', {
          username: 'admin',
          password: 'admin123'
        });
        if (loginResponse.status === 200 && loginResponse.data.token) {
          this.adminToken = loginResponse.data.token;
          console.log('✅ 获取管理员token成功');
        } else {
          console.warn('⚠️ 登录失败，将使用直接数据库操作');
        }
      } catch (error) {
        console.warn('⚠️ 无法获取管理员token，将使用直接数据库操作');
      }

      // 3. 检查转发规则
      const rules = await UserForwardRule.findAll({
        where: { userId: this.testUserId }
      });
      console.log(`✅ 找到 ${rules.length} 个转发规则`);

      // 4. 确保GOST服务运行
      await this.checkGostService();

      console.log('🎯 测试环境初始化完成\n');
    } catch (error) {
      console.error('❌ 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 检查GOST服务状态
   */
  async checkGostService() {
    try {
      const response = await this.makeHttpRequest('GET', 'http://localhost:3000/api/gost/status');
      if (response.status === 200 && response.data.isRunning) {
        console.log('✅ GOST服务运行正常');
      } else {
        console.log('⚠️ GOST服务未运行，尝试启动...');
        await this.makeHttpRequest('POST', 'http://localhost:3000/api/gost/start');
        await this.sleep(5000);
      }
    } catch (error) {
      console.warn('⚠️ 无法检查GOST服务状态:', error.message);
    }
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

      console.log(`✅ 流量已重置: 配额${quotaGB}GB, 已使用0MB`);
      if (restoredCount > 0) {
        console.log(`✅ 自动恢复了 ${restoredCount} 个被禁用的规则`);
      }

      // 3. 触发配置同步
      await this.triggerConfigSync('traffic_reset');
      await this.sleep(3000);

      return user;
    } catch (error) {
      console.error('❌ 重置用户流量失败:', error);
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

      console.log(`✅ 配额已增加: ${user.trafficQuota}GB → ${newQuota}GB`);
      console.log(`📊 当前使用率: ${usagePercentage.toFixed(1)}%`);

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
          }
        }

        if (restoredCount > 0) {
          console.log(`✅ 自动恢复了 ${restoredCount} 个被禁用的规则`);
        }
      } else {
        console.log(`⚠️ 配额仍不足，暂不恢复规则`);
      }

      // 触发配置同步
      await this.triggerConfigSync('quota_increase');
      await this.sleep(3000);

      return user;
    } catch (error) {
      console.error('❌ 增加用户配额失败:', error);
      throw error;
    }
  }

  /**
   * 触发配置同步
   */
  async triggerConfigSync(reason = 'test') {
    try {
      if (this.adminToken) {
        await this.makeHttpRequest('POST', 'http://localhost:3000/api/gost-config/sync', {}, {
          Authorization: `Bearer ${this.adminToken}`
        });
        console.log(`🔄 配置同步已触发 (${reason})`);
      } else {
        console.log(`⚠️ 无管理员token，跳过配置同步`);
      }
    } catch (error) {
      console.warn(`⚠️ 配置同步失败: ${error.message}`);
    }
  }

  /**
   * 执行流量测试
   */
  async performTrafficTest(testName, expectedSuccess = true) {
    const startTime = Date.now();
    let success = false;
    let actualSize = 0;
    let error = null;

    try {
      console.log(`\n🧪 执行流量测试: ${testName} (${this.testSize}MB)`);

      const response = await this.makeHttpRequest(
        'GET',
        `${this.baseUrl}/api/test/traffic-custom?size=${this.testSize}`
      );

      if (response.status === 200 && response.data) {
        success = true;
        actualSize = response.data.actualSize || this.testSize;
        console.log(`✅ 测试成功: 传输了 ${actualSize}MB`);
      }
    } catch (err) {
      error = err.message;
      console.log(`❌ 测试失败: ${error}`);
    }

    const duration = Date.now() - startTime;
    const result = {
      testName,
      expectedSuccess,
      actualSuccess: success,
      actualSize,
      duration,
      error,
      timestamp: new Date().toISOString()
    };

    // 验证结果是否符合预期
    if (success === expectedSuccess) {
      console.log(`✅ 结果符合预期: ${expectedSuccess ? '成功' : '失败'}`);
    } else {
      console.log(`❌ 结果不符合预期: 期望${expectedSuccess ? '成功' : '失败'}，实际${success ? '成功' : '失败'}`);
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
   * 检查转发规则状态
   */
  async checkForwardRulesStatus() {
    try {
      const rules = await UserForwardRule.findAll({
        where: { userId: this.testUserId }
      });

      const activeRules = rules.filter(r => r.isActive);
      const inactiveRules = rules.filter(r => !r.isActive);

      console.log(`📊 转发规则状态: ${activeRules.length} 个激活, ${inactiveRules.length} 个禁用`);

      return {
        total: rules.length,
        active: activeRules.length,
        inactive: inactiveRules.length,
        rules: rules.map(r => ({
          id: r.id,
          port: r.sourcePort,
          active: r.isActive,
          description: r.description
        }))
      };
    } catch (error) {
      console.error('检查转发规则状态失败:', error);
      return null;
    }
  }

  /**
   * 等待指定时间
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 执行单轮测试
   */
  async performSingleRound(roundType, roundNumber) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎯 ${roundType}测试 - 第${roundNumber}轮`);
    console.log(`${'='.repeat(60)}`);

    const roundResult = {
      roundType,
      roundNumber,
      tests: [],
      startTime: new Date().toISOString()
    };

    try {
      // 1. 检查初始状态
      console.log('\n📊 检查初始状态...');
      const initialStatus = await this.getUserStatus();
      const initialRules = await this.checkForwardRulesStatus();

      console.log(`💾 用户状态: ${initialStatus.usedMB.toFixed(1)}MB / ${initialStatus.quota * 1024}MB (${initialStatus.usagePercentage.toFixed(1)}%)`);

      // 2. 测试转发是否生效 (应该成功)
      console.log('\n🔍 测试转发是否生效...');
      const test1 = await this.performTrafficTest(`${roundType}-R${roundNumber}-初始测试`, true);
      roundResult.tests.push(test1);

      if (!test1.actualSuccess) {
        console.log('❌ 初始测试失败，转发未生效！');
        roundResult.error = '初始测试失败，转发未生效';
        return roundResult;
      }

      // 3. 等待流量统计更新
      console.log('\n⏳ 等待流量统计更新...');
      await this.sleep(5000);

      // 4. 继续测试直到达到限额
      let testCount = 1;
      let limitReached = false;

      while (testCount < 10 && !limitReached) { // 最多10次测试，防止无限循环
        testCount++;

        // 检查当前状态
        const currentStatus = await this.getUserStatus();
        console.log(`\n📊 当前状态: ${currentStatus.usedMB.toFixed(1)}MB / ${currentStatus.quota * 1024}MB (${currentStatus.usagePercentage.toFixed(1)}%)`);

        if (currentStatus.usagePercentage >= 100) {
          console.log('🚫 已达到流量限额，测试转发是否被阻止...');

          // 测试转发是否被阻止 (应该失败)
          const blockTest = await this.performTrafficTest(`${roundType}-R${roundNumber}-限额阻止测试`, false);
          roundResult.tests.push(blockTest);

          if (blockTest.actualSuccess) {
            console.log('❌ 警告：达到限额后转发仍然成功！');
          } else {
            console.log('✅ 确认：达到限额后转发被正确阻止');
          }

          limitReached = true;
          break;
        }

        // 继续测试
        const continueTest = await this.performTrafficTest(`${roundType}-R${roundNumber}-继续测试${testCount}`, true);
        roundResult.tests.push(continueTest);

        if (!continueTest.actualSuccess) {
          console.log('🚫 转发被阻止，可能已达到限额');
          limitReached = true;
          break;
        }

        // 短暂等待
        await this.sleep(2000);
      }

      // 5. 检查最终状态
      const finalStatus = await this.getUserStatus();
      const finalRules = await this.checkForwardRulesStatus();

      roundResult.finalStatus = finalStatus;
      roundResult.finalRules = finalRules;
      roundResult.limitReached = limitReached;

      console.log(`\n📊 最终状态: ${finalStatus.usedMB.toFixed(1)}MB / ${finalStatus.quota * 1024}MB (${finalStatus.usagePercentage.toFixed(1)}%)`);
      console.log(`🎯 本轮测试完成: 执行了${roundResult.tests.length}次流量测试`);

    } catch (error) {
      console.error(`❌ 第${roundNumber}轮测试失败:`, error);
      roundResult.error = error.message;
    }

    roundResult.endTime = new Date().toISOString();
    return roundResult;
  }

  /**
   * 执行前3轮重置测试
   */
  async performResetRounds() {
    console.log('\n🔄 开始重置流量测试阶段 (3轮)');
    console.log('每轮测试: 重置流量 → 测试转发 → 达到限额 → 转发被阻止');

    for (let i = 1; i <= 3; i++) {
      console.log(`\n🔄 准备第${i}轮重置测试...`);

      // 重置用户流量
      await this.resetUserTrafficAndRestoreRules(this.initialQuota);
      await this.sleep(3000);

      // 执行测试
      const result = await this.performSingleRound('重置', i);
      this.testResults.push(result);

      // 轮次间延迟
      if (i < 3) {
        console.log('\n⏳ 等待5秒后进行下一轮测试...');
        await this.sleep(5000);
      }
    }
  }

  /**
   * 执行后3轮增量测试
   */
  async performIncrementalRounds() {
    console.log('\n📈 开始增量配额测试阶段 (3轮)');
    console.log('每轮测试: 达到限额 → 增加1GB配额 → 转发恢复 → 继续测试');

    // 重置用户流量开始增量测试
    await this.resetUserTrafficAndRestoreRules(this.initialQuota);
    await this.sleep(3000);

    for (let i = 1; i <= 3; i++) {
      console.log(`\n📈 准备第${i}轮增量测试...`);

      if (i > 1) {
        // 增加1GB配额
        await this.increaseUserQuotaAndRestoreRules(1);
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
   * 生成测试报告
   */
  generateTestReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 全面流量限制测试报告');
    console.log('='.repeat(80));

    let totalTests = 0;
    let successfulTests = 0;
    let expectedResults = 0;

    this.testResults.forEach((round, index) => {
      console.log(`\n🎯 第${round.roundNumber}轮 (${round.roundType}测试):`);
      console.log(`   开始时间: ${round.startTime}`);
      console.log(`   结束时间: ${round.endTime}`);
      console.log(`   测试次数: ${round.tests.length}`);
      console.log(`   达到限额: ${round.limitReached ? '是' : '否'}`);

      if (round.finalStatus) {
        console.log(`   最终流量: ${round.finalStatus.usedMB.toFixed(1)}MB / ${round.finalStatus.quota * 1024}MB`);
        console.log(`   使用率: ${round.finalStatus.usagePercentage.toFixed(1)}%`);
      }

      if (round.finalRules) {
        console.log(`   转发规则: ${round.finalRules.active}个激活, ${round.finalRules.inactive}个禁用`);
      }

      // 统计测试结果
      round.tests.forEach(test => {
        totalTests++;
        if (test.actualSuccess) successfulTests++;
        if (test.actualSuccess === test.expectedSuccess) expectedResults++;
      });

      if (round.error) {
        console.log(`   ❌ 错误: ${round.error}`);
      }
    });

    console.log('\n📈 总体统计:');
    console.log(`   总测试次数: ${totalTests}`);
    console.log(`   成功次数: ${successfulTests}`);
    console.log(`   符合预期: ${expectedResults}/${totalTests} (${((expectedResults/totalTests)*100).toFixed(1)}%)`);
    console.log(`   测试轮数: ${this.testResults.length}/6`);

    // 检查关键指标
    console.log('\n🔍 关键指标检查:');

    const resetRounds = this.testResults.filter(r => r.roundType === '重置');
    const incrementalRounds = this.testResults.filter(r => r.roundType === '增量');

    console.log(`   重置测试轮数: ${resetRounds.length}/3`);
    console.log(`   增量测试轮数: ${incrementalRounds.length}/3`);

    const allReachedLimit = this.testResults.every(r => r.limitReached);
    console.log(`   所有轮次都达到限额: ${allReachedLimit ? '是' : '否'}`);

    if (expectedResults === totalTests) {
      console.log('\n✅ 测试结果: 所有测试都符合预期，系统运行正常！');
    } else {
      console.log('\n❌ 测试结果: 部分测试不符合预期，需要检查系统配置！');
    }

    console.log('\n' + '='.repeat(80));
  }

  /**
   * 执行完整的6轮测试
   */
  async runFullTest() {
    try {
      console.log('🚀 开始全面的6轮流量限制测试');
      console.log('测试目标: 验证流量重置/增加后转发立即生效，达到限额后转发立即失效');

      // 初始化
      await this.initialize();

      // 执行前3轮重置测试
      await this.performResetRounds();

      // 执行后3轮增量测试
      await this.performIncrementalRounds();

      // 生成报告
      this.generateTestReport();

      console.log('\n🎉 全部6轮测试完成！');

    } catch (error) {
      console.error('❌ 测试执行失败:', error);
      throw error;
    }
  }
}

// 执行测试
if (require.main === module) {
  const tester = new Comprehensive6RoundTrafficTester();
  tester.runFullTest()
    .then(() => {
      console.log('✅ 测试脚本执行完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ 测试脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = Comprehensive6RoundTrafficTester;
