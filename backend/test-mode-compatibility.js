#!/usr/bin/env node

/**
 * 🧪 单机模式兼容性测试脚本
 *
 * 测试目标：
 * 1. 验证单机模式不会影响自动模式的正常运行
 * 2. 验证模式切换的正确性
 * 3. 验证配置的隔离性
 */

const performanceConfigManager = require('./services/performanceConfigManager');
const systemModeManager = require('./services/systemModeManager');

class ModeCompatibilityTest {
  constructor() {
    this.testResults = [];
    this.originalConfig = null;
  }

  /**
   * 运行所有测试
   */
  async runAllTests() {
    console.log('🧪 开始单机模式兼容性测试...\n');

    try {
      // 保存原始配置
      await this.saveOriginalConfig();

      // 测试1: 验证默认自动模式
      await this.testDefaultAutoMode();

      // 测试2: 切换到单机模式
      await this.testSwitchToSimpleMode();

      // 测试3: 验证单机模式配置
      await this.testSimpleModeConfig();

      // 测试4: 切换回自动模式
      await this.testSwitchBackToAutoMode();

      // 测试5: 验证自动模式恢复
      await this.testAutoModeRestored();

      // 测试6: 验证配置隔离性
      await this.testConfigIsolation();

      // 恢复原始配置
      await this.restoreOriginalConfig();

      // 输出测试结果
      this.printTestResults();

    } catch (error) {
      console.error('❌ 测试执行失败:', error);
      await this.restoreOriginalConfig();
    }
  }

  /**
   * 保存原始配置
   */
  async saveOriginalConfig() {
    console.log('💾 保存原始配置...');
    this.originalConfig = performanceConfigManager.getFullConfig();
    console.log(`✅ 原始配置已保存 (模式: ${this.originalConfig.systemMode?.isSimpleMode ? '单击' : '自动'})\n`);
  }

  /**
   * 恢复原始配置
   */
  async restoreOriginalConfig() {
    if (this.originalConfig) {
      console.log('🔄 恢复原始配置...');
      await performanceConfigManager.updateConfig(this.originalConfig, 'test', '测试完成，恢复原始配置');
      console.log('✅ 原始配置已恢复\n');
    }
  }

  /**
   * 测试1: 验证默认自动模式
   */
  async testDefaultAutoMode() {
    console.log('🧪 测试1: 验证默认自动模式');
    
    try {
      const isSimpleMode = performanceConfigManager.isSimpleMode();
      const pluginConfig = performanceConfigManager.getGostPluginConfig();
      
      this.assert(!isSimpleMode, '默认应该是自动模式');
      this.assert(!pluginConfig.disableQuotaEnforcement, '自动模式下配额强制执行应该启用');
      this.assert(!pluginConfig.disableConfigSync, '自动模式下配置同步应该启用');
      this.assert(!pluginConfig.batchDatabaseOperations, '自动模式下批量数据库操作应该禁用');
      
      this.recordTest('默认自动模式', true, '所有配置符合预期');
      
    } catch (error) {
      this.recordTest('默认自动模式', false, error.message);
    }
    
    console.log('');
  }

  /**
   * 测试2: 切换到单击模式
   */
  async testSwitchToSimpleMode() {
    console.log('🧪 测试2: 切换到单击模式');
    
    try {
      await performanceConfigManager.updateConfig({
        systemMode: { isSimpleMode: true }
      }, 'test', '测试切换到单击模式');
      
      await systemModeManager.switchMode(true);
      
      const isSimpleMode = performanceConfigManager.isSimpleMode();
      this.assert(isSimpleMode, '应该成功切换到单击模式');
      
      this.recordTest('切换到单击模式', true, '模式切换成功');
      
    } catch (error) {
      this.recordTest('切换到单击模式', false, error.message);
    }
    
    console.log('');
  }

  /**
   * 测试3: 验证单击模式配置
   */
  async testSimpleModeConfig() {
    console.log('🧪 测试3: 验证单击模式配置');
    
    try {
      const isSimpleMode = performanceConfigManager.isSimpleMode();
      const pluginConfig = performanceConfigManager.getGostPluginConfig();
      const systemStatus = systemModeManager.getStatus();
      
      this.assert(isSimpleMode, '应该处于单机模式');
      this.assert(pluginConfig.disableQuotaEnforcement, '单机模式下配额强制执行应该禁用');
      this.assert(pluginConfig.disableConfigSync, '单机模式下配置同步应该禁用');
      this.assert(pluginConfig.batchDatabaseOperations, '单机模式下批量数据库操作应该启用');

      this.assert(!systemStatus.services.gostSyncCoordinator, '同步协调器应该停止');
      this.assert(!systemStatus.services.cacheCoordinator, '缓存协调器应该停止');
      this.assert(!systemStatus.services.gostHealthService, '健康检查服务应该停止');
      this.assert(systemStatus.services.multiInstanceCacheService, '多实例缓存服务应该保留');

      this.recordTest('单机模式配置', true, '所有配置符合预期');
      
    } catch (error) {
      this.recordTest('单击模式配置', false, error.message);
    }
    
    console.log('');
  }

  /**
   * 测试4: 切换回自动模式
   */
  async testSwitchBackToAutoMode() {
    console.log('🧪 测试4: 切换回自动模式');
    
    try {
      await performanceConfigManager.updateConfig({
        systemMode: { isSimpleMode: false }
      }, 'test', '测试切换回自动模式');
      
      await systemModeManager.switchMode(false);
      
      const isSimpleMode = performanceConfigManager.isSimpleMode();
      this.assert(!isSimpleMode, '应该成功切换回自动模式');
      
      this.recordTest('切换回自动模式', true, '模式切换成功');
      
    } catch (error) {
      this.recordTest('切换回自动模式', false, error.message);
    }
    
    console.log('');
  }

  /**
   * 测试5: 验证自动模式恢复
   */
  async testAutoModeRestored() {
    console.log('🧪 测试5: 验证自动模式恢复');
    
    try {
      const isSimpleMode = performanceConfigManager.isSimpleMode();
      const pluginConfig = performanceConfigManager.getGostPluginConfig();
      const systemStatus = systemModeManager.getStatus();
      
      this.assert(!isSimpleMode, '应该处于自动模式');
      this.assert(!pluginConfig.disableQuotaEnforcement, '自动模式下配额强制执行应该启用');
      this.assert(!pluginConfig.disableConfigSync, '自动模式下配置同步应该启用');
      this.assert(!pluginConfig.batchDatabaseOperations, '自动模式下批量数据库操作应该禁用');
      
      this.assert(systemStatus.services.gostSyncCoordinator, '同步协调器应该启动');
      this.assert(systemStatus.services.cacheCoordinator, '缓存协调器应该启动');
      this.assert(systemStatus.services.gostHealthService, '健康检查服务应该启动');
      this.assert(systemStatus.services.multiInstanceCacheService, '多实例缓存服务应该运行');
      
      this.recordTest('自动模式恢复', true, '所有配置恢复正常');
      
    } catch (error) {
      this.recordTest('自动模式恢复', false, error.message);
    }
    
    console.log('');
  }

  /**
   * 测试6: 验证配置隔离性
   */
  async testConfigIsolation() {
    console.log('🧪 测试6: 验证配置隔离性');
    
    try {
      // 在自动模式下修改其他配置
      const originalCacheConfig = performanceConfigManager.getCacheConfig();
      
      await performanceConfigManager.updateConfig({
        cacheConfig: {
          ...originalCacheConfig,
          authCacheTimeout: 999999
        }
      }, 'test', '测试配置隔离性');
      
      // 切换到单击模式
      await performanceConfigManager.updateConfig({
        systemMode: { isSimpleMode: true }
      }, 'test', '测试配置隔离性 - 切换到单击模式');
      
      // 验证其他配置没有被影响
      const newCacheConfig = performanceConfigManager.getCacheConfig();
      this.assert(newCacheConfig.authCacheTimeout === 999999, '其他配置应该保持不变');
      
      // 切换回自动模式
      await performanceConfigManager.updateConfig({
        systemMode: { isSimpleMode: false }
      }, 'test', '测试配置隔离性 - 切换回自动模式');
      
      // 验证配置仍然保持
      const finalCacheConfig = performanceConfigManager.getCacheConfig();
      this.assert(finalCacheConfig.authCacheTimeout === 999999, '配置应该在模式切换后保持');
      
      this.recordTest('配置隔离性', true, '配置隔离正常');
      
    } catch (error) {
      this.recordTest('配置隔离性', false, error.message);
    }
    
    console.log('');
  }

  /**
   * 断言辅助方法
   */
  assert(condition, message) {
    if (!condition) {
      throw new Error(`断言失败: ${message}`);
    }
  }

  /**
   * 记录测试结果
   */
  recordTest(testName, passed, message) {
    this.testResults.push({
      name: testName,
      passed,
      message,
      timestamp: new Date()
    });
    
    const status = passed ? '✅ 通过' : '❌ 失败';
    console.log(`${status}: ${testName} - ${message}`);
  }

  /**
   * 输出测试结果
   */
  printTestResults() {
    console.log('\n📊 测试结果汇总:');
    console.log('='.repeat(50));
    
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(t => t.passed).length;
    const failedTests = totalTests - passedTests;
    
    this.testResults.forEach(test => {
      const status = test.passed ? '✅' : '❌';
      console.log(`${status} ${test.name}: ${test.message}`);
    });
    
    console.log('='.repeat(50));
    console.log(`总计: ${totalTests} 个测试`);
    console.log(`通过: ${passedTests} 个`);
    console.log(`失败: ${failedTests} 个`);
    console.log(`成功率: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (failedTests === 0) {
      console.log('\n🎉 所有测试通过！单击模式与自动模式兼容性良好！');
    } else {
      console.log('\n⚠️ 存在失败的测试，请检查兼容性问题！');
    }
  }
}

// 运行测试
if (require.main === module) {
  const test = new ModeCompatibilityTest();
  test.runAllTests().catch(console.error);
}

module.exports = ModeCompatibilityTest;
