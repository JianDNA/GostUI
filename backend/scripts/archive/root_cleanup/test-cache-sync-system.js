/**
 * 🚀 缓存同步系统完整测试
 * 
 * 测试内容:
 * 1. 30秒同步纠错机制
 * 2. 主动缓存清理机制
 * 3. 用户编辑操作的缓存同步
 * 4. 多层缓存一致性检查
 * 5. 性能监控和统计
 */

const axios = require('axios');

// 测试配置
const TEST_CONFIG = {
  baseUrl: 'http://localhost:3000',
  testUserId: 1,
  testPort: 6443,
  syncInterval: 30000, // 30秒
  testDuration: 120000 // 2分钟测试
};

// 格式化时间
function formatTime(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(1)}μs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// 获取缓存统计信息
async function getCacheStats() {
  try {
    const response = await axios.get(`${TEST_CONFIG.baseUrl}/api/gost-plugin/status`);
    return {
      auth: response.data?.auth || {},
      multiInstance: response.data?.multiInstance || {},
      coordinator: response.data?.coordinator || {}
    };
  } catch (error) {
    console.warn('⚠️ 获取缓存统计失败:', error.message);
    return {};
  }
}

// 模拟用户编辑操作
async function simulateUserEdit(userId, operation) {
  const operations = {
    updateQuota: async () => {
      return await axios.put(`${TEST_CONFIG.baseUrl}/api/users/${userId}`, {
        trafficQuota: Math.floor(Math.random() * 1000) + 500
      });
    },
    
    createRule: async () => {
      const port = 10000 + Math.floor(Math.random() * 1000);
      return await axios.post(`${TEST_CONFIG.baseUrl}/api/user-forward-rules`, {
        name: `test-rule-${Date.now()}`,
        sourcePort: port,
        targetHost: '127.0.0.1',
        targetPort: 8080,
        protocol: 'tcp'
      });
    },
    
    deleteRule: async () => {
      // 先获取用户的规则列表
      const rulesResponse = await axios.get(`${TEST_CONFIG.baseUrl}/api/user-forward-rules`);
      const rules = rulesResponse.data.filter(rule => rule.userId === userId);
      
      if (rules.length > 0) {
        const ruleToDelete = rules[Math.floor(Math.random() * rules.length)];
        return await axios.delete(`${TEST_CONFIG.baseUrl}/api/user-forward-rules/${ruleToDelete.id}`);
      }
      return null;
    }
  };
  
  if (operations[operation]) {
    return await operations[operation]();
  }
  
  throw new Error(`未知操作: ${operation}`);
}

// 测试缓存同步纠错机制
async function testSyncCorrection() {
  console.log('🔄 测试缓存同步纠错机制...\n');
  
  const results = {
    syncEvents: [],
    cacheChanges: [],
    errors: []
  };
  
  // 获取初始状态
  const initialStats = await getCacheStats();
  console.log('📊 初始缓存状态:');
  console.log(`   认证器缓存命中率: ${initialStats.auth?.cacheHitRate || '0%'}`);
  console.log(`   多实例缓存大小: ${initialStats.multiInstance?.userCacheSize || 0}`);
  
  // 监控同步事件
  const startTime = Date.now();
  const monitorInterval = setInterval(async () => {
    try {
      const currentStats = await getCacheStats();
      const elapsed = Date.now() - startTime;
      
      results.syncEvents.push({
        timestamp: new Date(),
        elapsed,
        stats: currentStats
      });
      
      console.log(`⏱️  ${formatTime(elapsed)} - 缓存状态检查:`);
      console.log(`   认证器: ${currentStats.auth?.cacheHitRate || '0%'} 命中率`);
      console.log(`   多实例: ${currentStats.multiInstance?.userCacheSize || 0} 用户缓存`);
      
    } catch (error) {
      results.errors.push({
        timestamp: new Date(),
        error: error.message
      });
    }
  }, 10000); // 每10秒检查一次
  
  // 运行测试
  setTimeout(() => {
    clearInterval(monitorInterval);
    console.log('\n✅ 同步纠错机制测试完成');
    console.log(`📊 监控事件数: ${results.syncEvents.length}`);
    console.log(`❌ 错误数: ${results.errors.length}`);
  }, TEST_CONFIG.testDuration);
  
  return results;
}

// 测试主动缓存清理机制
async function testActiveCacheClear() {
  console.log('🧹 测试主动缓存清理机制...\n');
  
  const results = {
    operations: [],
    cacheChanges: [],
    errors: []
  };
  
  const operations = ['updateQuota', 'createRule', 'deleteRule'];
  
  for (let i = 0; i < 5; i++) {
    try {
      const operation = operations[i % operations.length];
      console.log(`🔄 执行操作 ${i + 1}: ${operation}`);
      
      // 获取操作前的缓存状态
      const beforeStats = await getCacheStats();
      
      // 执行用户编辑操作
      const startTime = Date.now();
      const response = await simulateUserEdit(TEST_CONFIG.testUserId, operation);
      const operationTime = Date.now() - startTime;
      
      // 等待缓存清理完成
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 获取操作后的缓存状态
      const afterStats = await getCacheStats();
      
      results.operations.push({
        operation,
        operationTime,
        success: response?.status >= 200 && response?.status < 300,
        beforeStats,
        afterStats
      });
      
      console.log(`   ✅ 操作完成，耗时: ${formatTime(operationTime)}`);
      console.log(`   📊 缓存变化: ${beforeStats.auth?.cacheHitRate || '0%'} → ${afterStats.auth?.cacheHitRate || '0%'}`);
      
      // 间隔一段时间再执行下一个操作
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      results.errors.push({
        operation: operations[i % operations.length],
        error: error.message
      });
      console.log(`   ❌ 操作失败: ${error.message}`);
    }
  }
  
  console.log('\n✅ 主动缓存清理测试完成');
  console.log(`📊 成功操作数: ${results.operations.filter(op => op.success).length}/${results.operations.length}`);
  console.log(`❌ 错误数: ${results.errors.length}`);
  
  return results;
}

// 测试缓存一致性
async function testCacheConsistency() {
  console.log('🔍 测试缓存一致性...\n');
  
  const results = {
    consistencyChecks: [],
    inconsistencies: [],
    errors: []
  };
  
  for (let i = 0; i < 3; i++) {
    try {
      console.log(`🔍 一致性检查 ${i + 1}:`);
      
      // 获取各层缓存的状态
      const stats = await getCacheStats();
      
      // 检查认证器缓存
      const authCacheSize = stats.auth?.portMappingCacheSize || 0;
      const authUserCacheSize = stats.auth?.userDataCacheSize || 0;
      
      // 检查多实例缓存
      const multiInstanceCacheSize = stats.multiInstance?.userCacheSize || 0;
      const portMappingSize = stats.multiInstance?.portMappingSize || 0;
      
      console.log(`   认证器端口缓存: ${authCacheSize}`);
      console.log(`   认证器用户缓存: ${authUserCacheSize}`);
      console.log(`   多实例用户缓存: ${multiInstanceCacheSize}`);
      console.log(`   多实例端口映射: ${portMappingSize}`);
      
      // 检查一致性
      const isConsistent = authCacheSize <= portMappingSize + 5 && // 允许5个条目的差异
                          authUserCacheSize <= multiInstanceCacheSize + 5;
      
      results.consistencyChecks.push({
        timestamp: new Date(),
        authCacheSize,
        authUserCacheSize,
        multiInstanceCacheSize,
        portMappingSize,
        isConsistent
      });
      
      if (!isConsistent) {
        results.inconsistencies.push({
          timestamp: new Date(),
          details: '缓存大小不一致'
        });
        console.log(`   ⚠️ 发现缓存不一致`);
      } else {
        console.log(`   ✅ 缓存一致性良好`);
      }
      
      // 等待一段时间再检查
      await new Promise(resolve => setTimeout(resolve, 15000));
      
    } catch (error) {
      results.errors.push({
        timestamp: new Date(),
        error: error.message
      });
      console.log(`   ❌ 一致性检查失败: ${error.message}`);
    }
  }
  
  console.log('\n✅ 缓存一致性测试完成');
  console.log(`📊 一致性检查数: ${results.consistencyChecks.length}`);
  console.log(`⚠️ 不一致次数: ${results.inconsistencies.length}`);
  console.log(`❌ 错误数: ${results.errors.length}`);
  
  return results;
}

// 主测试函数
async function runCacheSyncSystemTest() {
  try {
    console.log('🚀 缓存同步系统完整测试');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // 1. 测试同步纠错机制
    const syncResults = await testSyncCorrection();
    
    // 2. 测试主动缓存清理
    const clearResults = await testActiveCacheClear();
    
    // 3. 测试缓存一致性
    const consistencyResults = await testCacheConsistency();
    
    // 4. 生成测试报告
    console.log('\n📈 测试报告');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log('\n🔄 同步纠错机制:');
    console.log(`   监控周期数: ${syncResults.syncEvents.length}`);
    console.log(`   错误次数: ${syncResults.errors.length}`);
    console.log(`   成功率: ${((syncResults.syncEvents.length - syncResults.errors.length) / syncResults.syncEvents.length * 100).toFixed(1)}%`);
    
    console.log('\n🧹 主动缓存清理:');
    const successfulOps = clearResults.operations.filter(op => op.success).length;
    console.log(`   成功操作数: ${successfulOps}/${clearResults.operations.length}`);
    console.log(`   平均操作时间: ${formatTime(clearResults.operations.reduce((sum, op) => sum + op.operationTime, 0) / clearResults.operations.length)}`);
    console.log(`   错误次数: ${clearResults.errors.length}`);
    
    console.log('\n🔍 缓存一致性:');
    const consistentChecks = consistencyResults.consistencyChecks.filter(check => check.isConsistent).length;
    console.log(`   一致性检查: ${consistentChecks}/${consistencyResults.consistencyChecks.length}`);
    console.log(`   一致性率: ${(consistentChecks / consistencyResults.consistencyChecks.length * 100).toFixed(1)}%`);
    console.log(`   不一致次数: ${consistencyResults.inconsistencies.length}`);
    
    // 5. 总体评估
    console.log('\n🎯 总体评估:');
    const overallScore = (
      (syncResults.syncEvents.length - syncResults.errors.length) / syncResults.syncEvents.length * 0.3 +
      successfulOps / clearResults.operations.length * 0.4 +
      consistentChecks / consistencyResults.consistencyChecks.length * 0.3
    ) * 100;
    
    console.log(`   综合得分: ${overallScore.toFixed(1)}/100`);
    
    if (overallScore >= 90) {
      console.log(`   评级: 优秀 ⭐⭐⭐⭐⭐`);
    } else if (overallScore >= 80) {
      console.log(`   评级: 良好 ⭐⭐⭐⭐`);
    } else if (overallScore >= 70) {
      console.log(`   评级: 一般 ⭐⭐⭐`);
    } else {
      console.log(`   评级: 需要改进 ⭐⭐`);
    }
    
    // 6. 建议
    console.log('\n💡 优化建议:');
    if (syncResults.errors.length > 0) {
      console.log(`   - 同步机制存在 ${syncResults.errors.length} 个错误，建议检查网络连接和服务状态`);
    }
    if (clearResults.errors.length > 0) {
      console.log(`   - 缓存清理存在 ${clearResults.errors.length} 个错误，建议检查API权限和数据完整性`);
    }
    if (consistencyResults.inconsistencies.length > 0) {
      console.log(`   - 发现 ${consistencyResults.inconsistencies.length} 次缓存不一致，建议增加同步频率`);
    }
    if (overallScore >= 90) {
      console.log(`   - 缓存同步系统运行良好，无需特别优化`);
    }
    
  } catch (error) {
    console.error('❌ 缓存同步系统测试失败:', error);
  }
}

// 运行测试
if (require.main === module) {
  runCacheSyncSystemTest();
}

module.exports = { runCacheSyncSystemTest };
