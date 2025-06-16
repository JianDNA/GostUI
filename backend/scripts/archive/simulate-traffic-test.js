#!/usr/bin/env node

/**
 * 模拟流量测试：验证500MB限额下的100MB频繁传输
 */

const http = require('http');
const { User } = require('./models');

class TrafficTestSimulator {
  constructor() {
    this.baseUrl = 'http://localhost:6443';
    this.testSize = 100; // 100MB
    this.userQuota = 500; // 500MB
    this.testCount = 0;
    this.successfulTransfers = 0;
    this.totalTransferred = 0;
    this.errors = [];
  }

  /**
   * 模拟单次100MB传输测试
   */
  async simulateTransfer() {
    return new Promise((resolve) => {
      try {
        this.testCount++;
        console.log(`\n🔄 [测试 ${this.testCount}] 开始100MB传输测试...`);

        const startTime = Date.now();

        // 模拟发送请求到6443端口
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
            data += chunk;
          });

          res.on('end', () => {
            if (res.statusCode === 200) {
              this.successfulTransfers++;
              this.totalTransferred += this.testSize;
              console.log(`✅ [测试 ${this.testCount}] 传输成功: ${this.testSize}MB, 耗时: ${duration}ms`);
              console.log(`📊 累计传输: ${this.totalTransferred}MB / ${this.userQuota}MB (${(this.totalTransferred/this.userQuota*100).toFixed(1)}%)`);
              resolve({ success: true, transferred: this.testSize, duration });
            } else {
              console.log(`❌ [测试 ${this.testCount}] 传输失败: HTTP ${res.statusCode}`);
              console.log(`📋 响应: ${data || 'No response data'}`);
              this.errors.push({
                test: this.testCount,
                status: res.statusCode,
                message: data,
                totalTransferred: this.totalTransferred
              });
              resolve({ success: false, status: res.statusCode, message: data });
            }
          });
        });

        req.on('error', (error) => {
          console.log(`❌ [测试 ${this.testCount}] 传输异常: ${error.message}`);

          if (error.code === 'ECONNREFUSED') {
            console.log(`🔍 连接被拒绝，可能是配额限制生效或服务不可用`);
          } else if (error.code === 'ECONNRESET') {
            console.log(`🔍 连接被重置，可能是流量限制中断了连接`);
          }

          this.errors.push({
            test: this.testCount,
            error: error.code || error.message,
            totalTransferred: this.totalTransferred
          });

          resolve({ success: false, error: error.code || error.message });
        });

        req.on('timeout', () => {
          console.log(`❌ [测试 ${this.testCount}] 请求超时`);
          req.destroy();
          this.errors.push({
            test: this.testCount,
            error: 'TIMEOUT',
            totalTransferred: this.totalTransferred
          });
          resolve({ success: false, error: 'TIMEOUT' });
        });

        req.end();

      } catch (error) {
        console.log(`❌ [测试 ${this.testCount}] 传输异常: ${error.message}`);
        this.errors.push({
          test: this.testCount,
          error: error.message,
          totalTransferred: this.totalTransferred
        });
        resolve({ success: false, error: error.message });
      }
    });
  }

  /**
   * 获取用户当前流量状态
   */
  async getUserTrafficStatus() {
    try {
      const user = await User.findOne({
        where: { username: 'test' },
        attributes: ['username', 'trafficQuota', 'usedTraffic']
      });

      if (user) {
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
      }

      return null;
    } catch (error) {
      console.error('获取用户流量状态失败:', error);
      return null;
    }
  }

  /**
   * 运行连续传输测试
   */
  async runContinuousTest() {
    console.log('🚀 开始模拟流量测试...');
    console.log(`📋 测试参数: 单次${this.testSize}MB, 用户配额${this.userQuota}MB`);
    console.log(`🎯 理论最大传输次数: ${Math.floor(this.userQuota / this.testSize)}次`);

    // 获取初始状态
    const initialStatus = await this.getUserTrafficStatus();
    if (initialStatus) {
      console.log(`📊 初始状态: 已使用${initialStatus.usedMB.toFixed(2)}MB (${initialStatus.usagePercentage.toFixed(1)}%)`);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 3;

    // 连续测试直到失败或达到限制
    while (consecutiveFailures < maxConsecutiveFailures) {
      const result = await this.simulateTransfer();

      if (result.success) {
        consecutiveFailures = 0;

        // 检查是否接近配额限制
        const currentStatus = await this.getUserTrafficStatus();
        if (currentStatus && currentStatus.usagePercentage >= 95) {
          console.log(`⚠️ 接近配额限制 (${currentStatus.usagePercentage.toFixed(1)}%)，继续测试...`);
        }

        // 短暂延迟，模拟真实使用场景
        await this.sleep(1000);

      } else {
        consecutiveFailures++;
        console.log(`⚠️ 连续失败次数: ${consecutiveFailures}/${maxConsecutiveFailures}`);

        // 检查是否是配额限制导致的失败
        const currentStatus = await this.getUserTrafficStatus();
        if (currentStatus && currentStatus.usagePercentage >= 100) {
          console.log(`🚫 配额已满 (${currentStatus.usagePercentage.toFixed(1)}%)，测试结束`);
          break;
        }

        // 失败后稍长延迟
        await this.sleep(2000);
      }

      // 安全限制：最多测试10次
      if (this.testCount >= 10) {
        console.log('⚠️ 达到最大测试次数限制，停止测试');
        break;
      }
    }

    // 输出测试结果
    await this.printTestResults();
  }

  /**
   * 输出测试结果
   */
  async printTestResults() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 测试结果统计:');

    console.log(`\n🔢 测试统计:`);
    console.log(`   总测试次数: ${this.testCount}`);
    console.log(`   成功传输: ${this.successfulTransfers}`);
    console.log(`   失败次数: ${this.testCount - this.successfulTransfers}`);
    console.log(`   成功率: ${this.testCount > 0 ? (this.successfulTransfers / this.testCount * 100).toFixed(1) : 0}%`);

    console.log(`\n📈 流量统计:`);
    console.log(`   模拟传输总量: ${this.totalTransferred}MB`);
    console.log(`   理论最大传输: ${this.userQuota}MB`);
    console.log(`   传输效率: ${(this.totalTransferred / this.userQuota * 100).toFixed(1)}%`);

    // 获取最终用户状态
    const finalStatus = await this.getUserTrafficStatus();
    if (finalStatus) {
      console.log(`\n💾 数据库记录:`);
      console.log(`   实际记录流量: ${finalStatus.usedMB.toFixed(2)}MB`);
      console.log(`   配额使用率: ${finalStatus.usagePercentage.toFixed(1)}%`);
      console.log(`   剩余配额: ${finalStatus.remainingMB.toFixed(2)}MB`);

      // 分析差异
      const difference = Math.abs(this.totalTransferred - finalStatus.usedMB);
      if (difference > 1) { // 1MB误差
        console.log(`\n⚠️ 流量记录差异: ${difference.toFixed(2)}MB`);
        console.log(`   模拟传输: ${this.totalTransferred}MB`);
        console.log(`   数据库记录: ${finalStatus.usedMB.toFixed(2)}MB`);
      } else {
        console.log(`\n✅ 流量记录准确，差异: ${difference.toFixed(2)}MB`);
      }
    }

    if (this.errors.length > 0) {
      console.log(`\n❌ 错误详情:`);
      this.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. 测试${error.test}: ${error.error || error.message} (已传输: ${error.totalTransferred}MB)`);
      });
    }

    console.log(`\n🎯 测试结论:`);
    if (this.successfulTransfers === 0) {
      console.log(`   ❌ 无法进行任何传输，可能存在配置问题`);
    } else if (this.totalTransferred >= this.userQuota * 0.9) {
      console.log(`   ✅ 流量限制工作正常，接近配额时正确阻止传输`);
    } else if (this.totalTransferred < this.userQuota * 0.5) {
      console.log(`   ⚠️ 传输量偏低，可能存在过早限制的问题`);
    } else {
      console.log(`   ✅ 流量控制基本正常`);
    }
  }

  /**
   * 延迟函数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 运行测试
async function runTest() {
  const simulator = new TrafficTestSimulator();

  try {
    await simulator.runContinuousTest();
  } catch (error) {
    console.error('❌ 测试运行失败:', error);
  }

  process.exit(0);
}

// 启动测试
runTest();
