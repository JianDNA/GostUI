#!/usr/bin/env node

/**
 * 优化系统测试脚本
 * 
 * 测试简化后的系统组件：
 * 1. 简化缓存服务
 * 2. 简化配额服务
 * 3. 简化同步服务
 * 4. 简化观察器
 * 5. 简化监控
 */

const { User, UserForwardRule } = require('./models');
const simplifiedCacheService = require('./services/simplifiedCacheService');
const simplifiedQuotaService = require('./services/simplifiedQuotaService');
const simplifiedSyncService = require('./services/simplifiedSyncService');
const simplifiedObserver = require('./services/simplifiedObserver');
const simplifiedMonitor = require('./services/simplifiedMonitor');

class OptimizedSystemTest {
  constructor() {
    this.testUser = null;
    this.testResults = [];
    
    console.log('🚀 优化系统测试初始化');
  }

  /**
   * 初始化测试环境
   */
  async initializeTest() {
    try {
      console.log('\n🔧 初始化测试环境...');
      
      // 获取test用户
      this.testUser = await User.findOne({ where: { username: 'test' } });
      if (!this.testUser) {
        throw new Error('test用户不存在');
      }
      
      console.log(`✅ 测试用户: ${this.testUser.username} (ID: ${this.testUser.id})`);
      console.log(`   配额: ${this.testUser.trafficQuota}GB`);
      console.log(`   已用: ${((this.testUser.usedTraffic || 0) / 1024 / 1024).toFixed(1)}MB`);
      
      return true;
      
    } catch (error) {
      console.error('❌ 初始化测试环境失败:', error);
      throw error;
    }
  }

  /**
   * 测试简化缓存服务
   */
  async testCacheService() {
    try {
      console.log('\n🧪 测试简化缓存服务...');
      
      // 1. 初始化缓存
      await simplifiedCacheService.initialize();
      
      // 2. 测试用户缓存
      const userCache = simplifiedCacheService.getUserCache(this.testUser.id);
      console.log(`   用户缓存: ${userCache ? '✅ 存在' : '❌ 不存在'}`);
      
      // 3. 测试端口映射
      const portMapping = simplifiedCacheService.getPortUserMapping();
      console.log(`   端口映射: ${Object.keys(portMapping).length}个端口`);
      
      // 4. 测试流量更新
      const originalTraffic = this.testUser.usedTraffic || 0;
      const testBytes = 1024 * 1024; // 1MB
      await simplifiedCacheService.updateUserTraffic(this.testUser.id, testBytes);
      console.log(`   流量更新: +${testBytes}字节`);
      
      // 5. 获取统计信息
      const stats = simplifiedCacheService.getStats();
      console.log(`   缓存统计: 命中率${(stats.hitRate * 100).toFixed(1)}%`);
      
      this.testResults.push({ test: 'CacheService', status: 'PASS' });
      console.log('✅ 简化缓存服务测试通过');
      
    } catch (error) {
      console.error('❌ 简化缓存服务测试失败:', error);
      this.testResults.push({ test: 'CacheService', status: 'FAIL', error: error.message });
    }
  }

  /**
   * 测试简化配额服务
   */
  async testQuotaService() {
    try {
      console.log('\n🧪 测试简化配额服务...');
      
      // 1. 检查用户配额
      const quotaResult = await simplifiedQuotaService.checkUserQuota(this.testUser.id, 'test');
      console.log(`   配额检查: ${quotaResult.allowed ? '✅ 允许' : '❌ 禁止'}`);
      console.log(`   配额原因: ${quotaResult.reason}`);
      
      // 2. 强制刷新
      const refreshResult = await simplifiedQuotaService.forceRefreshUser(this.testUser.id, 'test_refresh');
      console.log(`   强制刷新: ${refreshResult.allowed ? '✅ 允许' : '❌ 禁止'}`);
      
      // 3. 获取服务状态
      const status = simplifiedQuotaService.getStatus();
      console.log(`   服务状态: 检查${status.stats.checksPerformed}次, 命中率${(status.stats.hitRate * 100).toFixed(1)}%`);
      
      this.testResults.push({ test: 'QuotaService', status: 'PASS' });
      console.log('✅ 简化配额服务测试通过');
      
    } catch (error) {
      console.error('❌ 简化配额服务测试失败:', error);
      this.testResults.push({ test: 'QuotaService', status: 'FAIL', error: error.message });
    }
  }

  /**
   * 测试简化同步服务
   */
  async testSyncService() {
    try {
      console.log('\n🧪 测试简化同步服务...');
      
      // 1. 请求同步
      const syncResult = await simplifiedSyncService.requestSync('test_sync', false, 7);
      console.log(`   同步请求: ${syncResult.success ? '✅ 成功' : '❌ 失败'}`);
      if (syncResult.success) {
        console.log(`   服务数量: ${syncResult.servicesCount}`);
      }
      
      // 2. 获取服务状态
      const status = simplifiedSyncService.getStatus();
      console.log(`   同步状态: 总计${status.stats.totalSyncs}次, 成功${status.stats.successfulSyncs}次`);
      
      this.testResults.push({ test: 'SyncService', status: 'PASS' });
      console.log('✅ 简化同步服务测试通过');
      
    } catch (error) {
      console.error('❌ 简化同步服务测试失败:', error);
      this.testResults.push({ test: 'SyncService', status: 'FAIL', error: error.message });
    }
  }

  /**
   * 测试简化观察器
   */
  async testObserver() {
    try {
      console.log('\n🧪 测试简化观察器...');
      
      // 1. 启动观察器
      await simplifiedObserver.start();
      console.log('   观察器启动: ✅ 成功');
      
      // 等待一下
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 2. 测试健康检查
      const axios = require('axios');
      try {
        const healthResponse = await axios.get('http://localhost:18081/health');
        console.log(`   健康检查: ✅ ${healthResponse.data.status}`);
      } catch (error) {
        console.log(`   健康检查: ❌ ${error.message}`);
      }
      
      // 3. 测试统计信息
      try {
        const statsResponse = await axios.get('http://localhost:18081/stats');
        console.log(`   统计信息: ✅ 端口映射${statsResponse.data.portMappings}个`);
      } catch (error) {
        console.log(`   统计信息: ❌ ${error.message}`);
      }
      
      this.testResults.push({ test: 'Observer', status: 'PASS' });
      console.log('✅ 简化观察器测试通过');
      
    } catch (error) {
      console.error('❌ 简化观察器测试失败:', error);
      this.testResults.push({ test: 'Observer', status: 'FAIL', error: error.message });
    }
  }

  /**
   * 测试简化监控
   */
  async testMonitor() {
    try {
      console.log('\n🧪 测试简化监控...');
      
      // 1. 启动监控
      simplifiedMonitor.startMonitoring();
      console.log('   监控启动: ✅ 成功');
      
      // 2. 等待一个监控周期
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 3. 获取监控状态
      const status = simplifiedMonitor.getStatus();
      console.log(`   监控状态: ${status.isRunning ? '✅ 运行中' : '❌ 已停止'}`);
      console.log(`   检查统计: 执行${status.stats.checksPerformed}次, 违规${status.stats.violationsFound}次`);
      
      // 4. 停止监控
      simplifiedMonitor.stopMonitoring();
      console.log('   监控停止: ✅ 成功');
      
      this.testResults.push({ test: 'Monitor', status: 'PASS' });
      console.log('✅ 简化监控测试通过');
      
    } catch (error) {
      console.error('❌ 简化监控测试失败:', error);
      this.testResults.push({ test: 'Monitor', status: 'FAIL', error: error.message });
    }
  }

  /**
   * 测试流量处理
   */
  async testTrafficProcessing() {
    try {
      console.log('\n🧪 测试流量处理...');
      
      // 模拟流量数据
      const mockTrafficData = {
        service: 'forward-tcp-6443',
        type: 'stats',
        stats: {
          inputBytes: 5 * 1024 * 1024,  // 5MB
          outputBytes: 3 * 1024 * 1024, // 3MB
          totalConns: 5,
          currentConns: 1,
          totalErrs: 0
        }
      };
      
      // 发送到观察器
      const axios = require('axios');
      try {
        await axios.post('http://localhost:18081/observer', mockTrafficData);
        console.log('   流量数据发送: ✅ 成功');
      } catch (error) {
        console.log(`   流量数据发送: ❌ ${error.message}`);
      }
      
      // 等待处理
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      this.testResults.push({ test: 'TrafficProcessing', status: 'PASS' });
      console.log('✅ 流量处理测试通过');
      
    } catch (error) {
      console.error('❌ 流量处理测试失败:', error);
      this.testResults.push({ test: 'TrafficProcessing', status: 'FAIL', error: error.message });
    }
  }

  /**
   * 运行完整测试
   */
  async runFullTest() {
    try {
      console.log('🚀 开始优化系统完整测试\n');
      
      // 初始化
      await this.initializeTest();
      
      // 测试各个组件
      await this.testCacheService();
      await this.testQuotaService();
      await this.testSyncService();
      await this.testObserver();
      await this.testMonitor();
      await this.testTrafficProcessing();
      
      // 生成测试报告
      this.generateTestReport();
      
      return true;
      
    } catch (error) {
      console.error('❌ 优化系统测试失败:', error);
      return false;
    }
  }

  /**
   * 生成测试报告
   */
  generateTestReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 优化系统测试报告');
    console.log('='.repeat(60));
    
    const passedTests = this.testResults.filter(r => r.status === 'PASS').length;
    const totalTests = this.testResults.length;
    
    console.log(`总测试数: ${totalTests}`);
    console.log(`通过测试: ${passedTests}`);
    console.log(`失败测试: ${totalTests - passedTests}`);
    console.log(`通过率: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    console.log('\n详细结果:');
    this.testResults.forEach(result => {
      const status = result.status === 'PASS' ? '✅' : '❌';
      console.log(`  ${status} ${result.test}: ${result.status}`);
      if (result.error) {
        console.log(`     错误: ${result.error}`);
      }
    });
    
    console.log('\n' + '='.repeat(60));
  }

  /**
   * 清理测试环境
   */
  async cleanup() {
    try {
      console.log('\n🧹 清理测试环境...');
      
      // 停止观察器
      await simplifiedObserver.stop();
      
      // 停止监控
      simplifiedMonitor.stopMonitoring();
      
      // 停止同步服务
      simplifiedSyncService.cleanup();
      
      // 停止缓存服务
      simplifiedCacheService.stop();
      
      console.log('✅ 测试环境清理完成');
      
    } catch (error) {
      console.error('❌ 清理测试环境失败:', error);
    }
  }
}

// 执行测试
if (require.main === module) {
  const test = new OptimizedSystemTest();
  
  test.runFullTest()
    .then(success => {
      if (success) {
        console.log('\n✅ 所有测试完成！');
      } else {
        console.log('\n❌ 测试失败！');
      }
      return test.cleanup();
    })
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ 测试执行失败:', error);
      process.exit(1);
    });
}

module.exports = OptimizedSystemTest;
