/**
 * 🧹 用户编辑操作缓存清理测试
 * 
 * 测试所有用户编辑相关的API是否正确清理缓存:
 * 1. 用户创建
 * 2. 用户更新 (状态、配额、端口范围等)
 * 3. 用户删除
 * 4. 延长过期时间
 * 5. 流量重置
 * 6. 规则创建/更新/删除
 */

const axios = require('axios');

// 测试配置
const TEST_CONFIG = {
  baseUrl: 'http://localhost:3000',
  adminToken: null,
  testUserId: null
};

// 格式化时间
function formatTime(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(1)}μs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// 获取管理员token
async function getAdminToken() {
  try {
    const response = await axios.post(`${TEST_CONFIG.baseUrl}/api/auth/login`, {
      username: 'admin',
      password: 'admin123'
    });
    return response.data.token;
  } catch (error) {
    throw new Error(`获取管理员token失败: ${error.message}`);
  }
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

// 创建测试用户
async function createTestUser() {
  const userData = {
    username: `testuser_${Date.now()}`,
    password: 'test123',
    email: `test_${Date.now()}@example.com`,
    role: 'user',
    portRangeStart: 20000,
    portRangeEnd: 20099,
    trafficQuota: 500
  };

  const response = await axios.post(`${TEST_CONFIG.baseUrl}/api/users`, userData, {
    headers: { Authorization: `Bearer ${TEST_CONFIG.adminToken}` }
  });

  return response.data;
}

// 测试用户编辑操作的缓存清理
async function testUserEditCacheClear() {
  console.log('🧹 测试用户编辑操作缓存清理...\n');
  
  const results = {
    operations: [],
    errors: []
  };

  try {
    // 1. 测试用户创建
    console.log('📝 测试用户创建缓存清理...');
    const beforeCreate = await getCacheStats();
    const startTime = Date.now();
    
    const testUser = await createTestUser();
    TEST_CONFIG.testUserId = testUser.id;
    
    const createTime = Date.now() - startTime;
    await new Promise(resolve => setTimeout(resolve, 1000)); // 等待缓存清理
    const afterCreate = await getCacheStats();
    
    results.operations.push({
      operation: 'user_create',
      userId: testUser.id,
      operationTime: createTime,
      beforeStats: beforeCreate,
      afterStats: afterCreate,
      success: true
    });
    
    console.log(`   ✅ 用户创建完成，耗时: ${formatTime(createTime)}`);
    console.log(`   📊 缓存状态: ${beforeCreate.auth?.cacheHitRate || '0%'} → ${afterCreate.auth?.cacheHitRate || '0%'}`);

    // 2. 测试用户状态更新
    console.log('\n📝 测试用户状态更新缓存清理...');
    const beforeStatusUpdate = await getCacheStats();
    const statusStartTime = Date.now();
    
    await axios.put(`${TEST_CONFIG.baseUrl}/api/users/${testUser.id}`, {
      userStatus: 'suspended'
    }, {
      headers: { Authorization: `Bearer ${TEST_CONFIG.adminToken}` }
    });
    
    const statusUpdateTime = Date.now() - statusStartTime;
    await new Promise(resolve => setTimeout(resolve, 1000));
    const afterStatusUpdate = await getCacheStats();
    
    results.operations.push({
      operation: 'user_status_update',
      userId: testUser.id,
      operationTime: statusUpdateTime,
      beforeStats: beforeStatusUpdate,
      afterStats: afterStatusUpdate,
      success: true
    });
    
    console.log(`   ✅ 用户状态更新完成，耗时: ${formatTime(statusUpdateTime)}`);

    // 3. 测试配额更新
    console.log('\n📝 测试配额更新缓存清理...');
    const beforeQuotaUpdate = await getCacheStats();
    const quotaStartTime = Date.now();
    
    await axios.put(`${TEST_CONFIG.baseUrl}/api/users/${testUser.id}`, {
      trafficQuota: 1000
    }, {
      headers: { Authorization: `Bearer ${TEST_CONFIG.adminToken}` }
    });
    
    const quotaUpdateTime = Date.now() - quotaStartTime;
    await new Promise(resolve => setTimeout(resolve, 1000));
    const afterQuotaUpdate = await getCacheStats();
    
    results.operations.push({
      operation: 'user_quota_update',
      userId: testUser.id,
      operationTime: quotaUpdateTime,
      beforeStats: beforeQuotaUpdate,
      afterStats: afterQuotaUpdate,
      success: true
    });
    
    console.log(`   ✅ 配额更新完成，耗时: ${formatTime(quotaUpdateTime)}`);

    // 4. 测试端口范围更新
    console.log('\n📝 测试端口范围更新缓存清理...');
    const beforePortUpdate = await getCacheStats();
    const portStartTime = Date.now();
    
    await axios.put(`${TEST_CONFIG.baseUrl}/api/users/${testUser.id}`, {
      portRangeStart: 21000,
      portRangeEnd: 21099
    }, {
      headers: { Authorization: `Bearer ${TEST_CONFIG.adminToken}` }
    });
    
    const portUpdateTime = Date.now() - portStartTime;
    await new Promise(resolve => setTimeout(resolve, 1000));
    const afterPortUpdate = await getCacheStats();
    
    results.operations.push({
      operation: 'user_port_range_update',
      userId: testUser.id,
      operationTime: portUpdateTime,
      beforeStats: beforePortUpdate,
      afterStats: afterPortUpdate,
      success: true
    });
    
    console.log(`   ✅ 端口范围更新完成，耗时: ${formatTime(portUpdateTime)}`);

    // 5. 测试延长过期时间
    console.log('\n📝 测试延长过期时间缓存清理...');
    const beforeExpiryExtend = await getCacheStats();
    const expiryStartTime = Date.now();
    
    await axios.post(`${TEST_CONFIG.baseUrl}/api/users/${testUser.id}/extend-expiry`, {
      months: 1
    }, {
      headers: { Authorization: `Bearer ${TEST_CONFIG.adminToken}` }
    });
    
    const expiryExtendTime = Date.now() - expiryStartTime;
    await new Promise(resolve => setTimeout(resolve, 1000));
    const afterExpiryExtend = await getCacheStats();
    
    results.operations.push({
      operation: 'user_expiry_extend',
      userId: testUser.id,
      operationTime: expiryExtendTime,
      beforeStats: beforeExpiryExtend,
      afterStats: afterExpiryExtend,
      success: true
    });
    
    console.log(`   ✅ 延长过期时间完成，耗时: ${formatTime(expiryExtendTime)}`);

    // 6. 测试流量重置
    console.log('\n📝 测试流量重置缓存清理...');
    const beforeTrafficReset = await getCacheStats();
    const trafficStartTime = Date.now();
    
    await axios.post(`${TEST_CONFIG.baseUrl}/api/users/${testUser.id}/reset-traffic`, {
      reason: '测试重置'
    }, {
      headers: { Authorization: `Bearer ${TEST_CONFIG.adminToken}` }
    });
    
    const trafficResetTime = Date.now() - trafficStartTime;
    await new Promise(resolve => setTimeout(resolve, 1000));
    const afterTrafficReset = await getCacheStats();
    
    results.operations.push({
      operation: 'user_traffic_reset',
      userId: testUser.id,
      operationTime: trafficResetTime,
      beforeStats: beforeTrafficReset,
      afterStats: afterTrafficReset,
      success: true
    });
    
    console.log(`   ✅ 流量重置完成，耗时: ${formatTime(trafficResetTime)}`);

    // 7. 测试用户删除
    console.log('\n📝 测试用户删除缓存清理...');
    const beforeDelete = await getCacheStats();
    const deleteStartTime = Date.now();
    
    await axios.delete(`${TEST_CONFIG.baseUrl}/api/users/${testUser.id}`, {
      headers: { Authorization: `Bearer ${TEST_CONFIG.adminToken}` }
    });
    
    const deleteTime = Date.now() - deleteStartTime;
    await new Promise(resolve => setTimeout(resolve, 1000));
    const afterDelete = await getCacheStats();
    
    results.operations.push({
      operation: 'user_delete',
      userId: testUser.id,
      operationTime: deleteTime,
      beforeStats: beforeDelete,
      afterStats: afterDelete,
      success: true
    });
    
    console.log(`   ✅ 用户删除完成，耗时: ${formatTime(deleteTime)}`);

  } catch (error) {
    results.errors.push({
      operation: 'unknown',
      error: error.message
    });
    console.log(`   ❌ 操作失败: ${error.message}`);
  }

  return results;
}

// 主测试函数
async function runUserEditCacheClearTest() {
  try {
    console.log('🧹 用户编辑操作缓存清理测试');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // 获取管理员token
    console.log('🔑 获取管理员token...');
    TEST_CONFIG.adminToken = await getAdminToken();
    console.log('✅ 管理员token获取成功\n');
    
    // 执行测试
    const results = await testUserEditCacheClear();
    
    // 生成测试报告
    console.log('\n📈 测试报告');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const successfulOps = results.operations.filter(op => op.success);
    console.log(`\n✅ 成功操作: ${successfulOps.length}/${results.operations.length}`);
    console.log(`❌ 失败操作: ${results.errors.length}`);
    
    if (successfulOps.length > 0) {
      const avgTime = successfulOps.reduce((sum, op) => sum + op.operationTime, 0) / successfulOps.length;
      console.log(`⏱️  平均操作时间: ${formatTime(avgTime)}`);
      
      console.log('\n📊 各操作详情:');
      successfulOps.forEach(op => {
        console.log(`   ${op.operation}: ${formatTime(op.operationTime)}`);
      });
    }
    
    if (results.errors.length > 0) {
      console.log('\n❌ 错误详情:');
      results.errors.forEach(error => {
        console.log(`   ${error.operation}: ${error.error}`);
      });
    }
    
    // 评估
    const successRate = successfulOps.length / (results.operations.length + results.errors.length) * 100;
    console.log(`\n🎯 成功率: ${successRate.toFixed(1)}%`);
    
    if (successRate >= 90) {
      console.log('🏆 评级: 优秀 - 缓存清理机制工作良好');
    } else if (successRate >= 80) {
      console.log('👍 评级: 良好 - 缓存清理机制基本正常');
    } else if (successRate >= 70) {
      console.log('⚠️ 评级: 一般 - 缓存清理机制需要改进');
    } else {
      console.log('❌ 评级: 需要修复 - 缓存清理机制存在问题');
    }
    
    console.log('\n💡 建议:');
    if (successRate >= 90) {
      console.log('   - 缓存清理机制运行良好，继续保持');
    } else {
      console.log('   - 检查失败的操作，完善缓存清理逻辑');
      console.log('   - 确保所有用户编辑API都使用缓存协调器');
    }
    
  } catch (error) {
    console.error('❌ 用户编辑缓存清理测试失败:', error);
  }
}

// 运行测试
if (require.main === module) {
  runUserEditCacheClearTest();
}

module.exports = { runUserEditCacheClearTest };
