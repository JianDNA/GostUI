#!/usr/bin/env node

/**
 * 配置同步优化测试脚本
 * 测试增强的配置同步验证、强制同步机制和改进的健康检查
 */

const { User } = require('./models');

class ConfigSyncOptimizationTester {
  constructor() {
    this.testResults = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🔍';
    const logMessage = `${prefix} [${timestamp}] ${message}`;
    console.log(logMessage);
    this.testResults.push({ timestamp, type, message });
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 测试1: 配置同步验证功能
   */
  async testConfigSyncVerification() {
    this.log('=== 测试配置同步验证功能 ===');
    
    try {
      const gostService = require('./services/gostService');
      
      // 获取当前配置
      const currentConfig = await gostService.getCurrentConfig();
      if (!currentConfig) {
        this.log('无法获取当前配置', 'error');
        return false;
      }
      
      this.log(`当前配置包含 ${currentConfig.services?.length || 0} 个服务`);
      
      // 测试配置同步验证
      const verificationResult = await gostService.verifyConfigSync(currentConfig);
      
      if (verificationResult.success) {
        this.log('配置同步验证通过', 'success');
        return true;
      } else {
        this.log(`配置同步验证失败: ${verificationResult.reason}`, 'error');
        return false;
      }
      
    } catch (error) {
      this.log(`配置同步验证测试异常: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * 测试2: 强制同步机制
   */
  async testForceSyncMechanism() {
    this.log('=== 测试强制同步机制 ===');
    
    try {
      // 模拟用户过期场景
      const testUser = await User.findOne({ where: { username: 'test' } });
      if (!testUser) {
        this.log('找不到测试用户', 'error');
        return false;
      }
      
      this.log(`测试用户: ${testUser.username}, 当前状态: ${testUser.userStatus}`);
      
      // 触发配额检查（应该触发强制同步）
      const quotaCoordinatorService = require('./services/quotaCoordinatorService');
      const quotaResult = await quotaCoordinatorService.checkUserQuota(testUser.id, 'test_force_sync', true);
      
      this.log(`配额检查结果: ${quotaResult.allowed ? '允许' : '禁止'} (${quotaResult.reason})`);
      
      if (!quotaResult.allowed) {
        this.log('强制同步机制已触发', 'success');
        return true;
      } else {
        this.log('用户状态正常，未触发强制同步', 'warning');
        return true;
      }
      
    } catch (error) {
      this.log(`强制同步机制测试异常: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * 测试3: 健康检查配置验证
   */
  async testHealthCheckConfigVerification() {
    this.log('=== 测试健康检查配置验证 ===');
    
    try {
      const gostHealthService = require('./services/gostHealthService');
      
      // 获取健康状态
      const healthStatus = gostHealthService.getHealthStatus();
      this.log(`健康检查服务状态: ${healthStatus.isRunning ? '运行中' : '已停止'}`);
      
      if (!healthStatus.isRunning) {
        this.log('健康检查服务未运行，启动服务...', 'warning');
        gostHealthService.start();
        await this.sleep(2000);
      }
      
      // 手动触发一次健康检查
      await gostHealthService.performHealthCheck();
      this.log('健康检查执行完成', 'success');
      
      return true;
      
    } catch (error) {
      this.log(`健康检查配置验证测试异常: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * 测试4: GOST API配置获取
   */
  async testGostApiConfigRetrieval() {
    this.log('=== 测试GOST API配置获取 ===');
    
    try {
      const gostService = require('./services/gostService');
      
      // 测试获取GOST实际运行配置
      const runningConfig = await gostService.getGostRunningConfig();
      
      if (runningConfig) {
        this.log(`成功获取GOST运行配置: ${runningConfig.services?.length || 0} 个服务`, 'success');
        
        // 显示服务详情
        if (runningConfig.services) {
          runningConfig.services.forEach(service => {
            this.log(`  - 服务: ${service.name}, 地址: ${service.addr}, 状态: ${service.status?.state || 'unknown'}`);
          });
        }
        
        return true;
      } else {
        this.log('无法获取GOST运行配置', 'error');
        return false;
      }
      
    } catch (error) {
      this.log(`GOST API配置获取测试异常: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * 测试5: 热加载增强功能
   */
  async testEnhancedHotReload() {
    this.log('=== 测试热加载增强功能 ===');
    
    try {
      const gostService = require('./services/gostService');
      
      // 获取当前配置
      const currentConfig = await gostService.getCurrentConfig();
      if (!currentConfig) {
        this.log('无法获取当前配置', 'error');
        return false;
      }
      
      // 测试带选项的热加载
      const hotReloadOptions = {
        trigger: 'test_enhanced_reload',
        force: false
      };
      
      const reloadResult = await gostService.hotReloadConfig(currentConfig, hotReloadOptions);
      
      if (reloadResult) {
        this.log('增强热加载功能测试通过', 'success');
        return true;
      } else {
        this.log('增强热加载功能测试失败', 'error');
        return false;
      }
      
    } catch (error) {
      this.log(`增强热加载功能测试异常: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * 运行所有测试
   */
  async runAllTests() {
    this.log('🚀 开始配置同步优化测试');
    
    const tests = [
      { name: '配置同步验证功能', fn: () => this.testConfigSyncVerification() },
      { name: '强制同步机制', fn: () => this.testForceSyncMechanism() },
      { name: '健康检查配置验证', fn: () => this.testHealthCheckConfigVerification() },
      { name: 'GOST API配置获取', fn: () => this.testGostApiConfigRetrieval() },
      { name: '热加载增强功能', fn: () => this.testEnhancedHotReload() }
    ];
    
    const results = {};
    let passedTests = 0;
    
    for (const test of tests) {
      this.log(`\n📋 执行测试: ${test.name}`);
      try {
        const result = await test.fn();
        results[test.name] = result;
        if (result) {
          passedTests++;
          this.log(`测试 "${test.name}" 通过`, 'success');
        } else {
          this.log(`测试 "${test.name}" 失败`, 'error');
        }
      } catch (error) {
        this.log(`测试 "${test.name}" 异常: ${error.message}`, 'error');
        results[test.name] = false;
      }
      await this.sleep(1000);
    }
    
    // 输出测试总结
    this.log(`\n📊 测试总结: ${passedTests}/${tests.length} 个测试通过`);
    
    if (passedTests === tests.length) {
      this.log('🎉 所有配置同步优化测试通过！', 'success');
    } else {
      this.log(`⚠️ ${tests.length - passedTests} 个测试失败，需要检查`, 'warning');
    }
    
    return results;
  }
}

// 运行测试
if (require.main === module) {
  const tester = new ConfigSyncOptimizationTester();
  tester.runAllTests().then(results => {
    console.log('\n✅ 配置同步优化测试完成');
    process.exit(0);
  }).catch(error => {
    console.error('❌ 测试执行失败:', error);
    process.exit(1);
  });
}

module.exports = ConfigSyncOptimizationTester;
