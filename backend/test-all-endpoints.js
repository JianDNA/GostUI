/**
 * 全面测试脚本
 * 
 * 测试所有主要端点，包括单机模式和自动模式
 */

const axios = require('axios');
const chalk = require('chalk');

// 配置
const API_BASE_URL = 'http://localhost:3000/api';
const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'admin123'
};

// 测试状态
let adminToken = null;
let userToken = null;
let userId = null;
let testRuleId = null;
let testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  total: 0
};

// 辅助函数
const log = {
  info: (msg) => console.log(`\x1b[34m[INFO] ${msg}\x1b[0m`),
  success: (msg) => console.log(`\x1b[32m[SUCCESS] ${msg}\x1b[0m`),
  error: (msg) => console.log(`\x1b[31m[ERROR] ${msg}\x1b[0m`),
  warn: (msg) => console.log(`\x1b[33m[WARN] ${msg}\x1b[0m`),
  result: (test, result) => {
    testResults.total++;
    if (result.success) {
      testResults.passed++;
      console.log(`\x1b[32m✅ [PASS] ${test}\x1b[0m`);
    } else {
      testResults.failed++;
      console.log(`\x1b[31m❌ [FAIL] ${test}: ${result.error}\x1b[0m`);
    }
  },
  skip: (test, reason) => {
    testResults.skipped++;
    testResults.total++;
    console.log(`\x1b[33m⚠️ [SKIP] ${test}: ${reason}\x1b[0m`);
  }
};

// 测试辅助函数
async function makeRequest(method, endpoint, data = null, auth = true) {
  try {
    const headers = {};
    if (auth && adminToken) {
      headers['Authorization'] = `Bearer ${adminToken}`;
    }

    const config = { headers };
    let response;

    if (method === 'GET') {
      response = await axios.get(`${API_BASE_URL}${endpoint}`, config);
    } else if (method === 'POST') {
      response = await axios.post(`${API_BASE_URL}${endpoint}`, data, config);
    } else if (method === 'PUT') {
      response = await axios.put(`${API_BASE_URL}${endpoint}`, data, config);
    } else if (method === 'DELETE') {
      response = await axios.delete(`${API_BASE_URL}${endpoint}`, config);
    }

    return {
      success: true,
      data: response.data,
      status: response.status
    };
  } catch (error) {
    let errorMessage = 'Unknown error';
    
    if (error.response) {
      errorMessage = `Status ${error.response.status}: ${JSON.stringify(error.response.data)}`;
    } else if (error.request) {
      errorMessage = 'No response received';
    } else {
      errorMessage = error.message;
    }
    
    return {
      success: false,
      error: errorMessage,
      originalError: error
    };
  }
}

// 测试函数
async function runTests() {
  log.info('开始全面测试...');
  
  // 1. 认证测试
  await testAuthentication();
  
  // 2. 用户管理测试
  await testUserManagement();
  
  // 3. 规则管理测试
  await testRuleManagement();
  
  // 4. 系统模式测试
  await testSystemModes();
  
  // 5. 配置同步测试
  await testConfigSync();
  
  // 6. 流量统计测试
  await testTrafficStats();
  
  // 7. 配额管理测试
  await testQuotaManagement();
  
  // 8. 清理测试数据
  await cleanupTestData();
  
  // 输出测试结果
  logTestResults();
}

// 认证测试
async function testAuthentication() {
  log.info('测试认证功能...');
  
  // 测试管理员登录
  const adminLoginResult = await makeRequest('POST', '/auth/login', ADMIN_CREDENTIALS, false);
  log.result('管理员登录', adminLoginResult);
  
  if (adminLoginResult.success) {
    adminToken = adminLoginResult.data.token;
    log.info(`管理员登录成功，获取到令牌`);
  } else {
    log.error('管理员登录失败，后续测试可能会失败');
  }
  
  // 测试获取当前用户信息
  const userInfoResult = await makeRequest('GET', '/users/me');
  log.result('获取当前用户信息', userInfoResult);
}

// 用户管理测试
async function testUserManagement() {
  log.info('测试用户管理功能...');
  
  // 获取所有用户
  const getAllUsersResult = await makeRequest('GET', '/users');
  log.result('获取所有用户', getAllUsersResult);
  
  // 创建测试用户
  const testUser = {
    username: `test_user_${Date.now()}`,
    password: 'password123',
    email: `test${Date.now()}@example.com`,
    role: 'user',
    isActive: true,
    portRangeStart: 10000,
    portRangeEnd: 10010
  };
  
  const createUserResult = await makeRequest('POST', '/users', testUser);
  log.result('创建测试用户', createUserResult);
  
  if (createUserResult.success) {
    userId = createUserResult.data.data.id;
    log.info(`创建的测试用户ID: ${userId}`);
    
    // 更新用户
    const updateUserResult = await makeRequest('PUT', `/users/${userId}`, {
      email: `updated${Date.now()}@example.com`
    });
    log.result('更新用户信息', updateUserResult);
    
    // 获取特定用户
    const getUserResult = await makeRequest('GET', `/users/${userId}`);
    log.result('获取特定用户', getUserResult);
  } else {
    log.error('创建测试用户失败，跳过用户相关测试');
  }
}

// 规则管理测试
async function testRuleManagement() {
  if (!userId) {
    log.skip('规则管理测试', '没有有效的测试用户ID');
    return;
  }
  
  log.info('测试规则管理功能...');
  
  // 创建测试规则
  const testRule = {
    name: `测试规则_${Date.now()}`,
    protocol: 'tcp',
    sourcePort: 10001,
    targetAddress: '127.0.0.1:8080',
    userId: userId,
    description: '测试描述'
  };
  
  const createRuleResult = await makeRequest('POST', '/userForwardRules', testRule);
  log.result('创建转发规则', createRuleResult);
  
  if (createRuleResult.success) {
    testRuleId = createRuleResult.data.data.id;
    log.info(`创建的测试规则ID: ${testRuleId}`);
    
    // 获取所有规则
    const getAllRulesResult = await makeRequest('GET', '/userForwardRules');
    log.result('获取所有规则', getAllRulesResult);
    
    // 获取特定规则
    const getRuleResult = await makeRequest('GET', `/userForwardRules/${testRuleId}`);
    log.result('获取特定规则', getRuleResult);
    
    // 更新规则
    const updateRuleResult = await makeRequest('PUT', `/userForwardRules/${testRuleId}`, {
      description: `更新的描述_${Date.now()}`
    });
    log.result('更新规则', updateRuleResult);
  } else {
    log.error('创建测试规则失败，跳过规则相关测试');
  }
}

// 系统模式测试
async function testSystemModes() {
  log.info('测试系统模式功能...');
  
  // 获取当前系统模式
  const getModeResult = await makeRequest('GET', '/system/mode');
  log.result('获取系统模式', getModeResult);
  
  // 切换到单机模式
  const switchToSimpleResult = await makeRequest('POST', '/system/mode/simple');
  log.result('切换到单机模式', switchToSimpleResult);
  
  // 在单机模式下测试配置生成
  await testConfigGeneration('单机模式');
  
  // 切换回自动模式
  const switchToAutoResult = await makeRequest('POST', '/system/mode/auto');
  log.result('切换回自动模式', switchToAutoResult);
  
  // 在自动模式下测试配置生成
  await testConfigGeneration('自动模式');
}

// 配置生成测试
async function testConfigGeneration(mode) {
  log.info(`测试${mode}下的配置生成...`);
  
  // 生成配置
  const generateConfigResult = await makeRequest('GET', '/gost-config/generate');
  log.result(`${mode}下生成配置`, generateConfigResult);
  
  // 获取当前配置
  const getCurrentConfigResult = await makeRequest('GET', '/gost-config/current');
  log.result(`${mode}下获取当前配置`, getCurrentConfigResult);
  
  // 比较配置
  const compareConfigResult = await makeRequest('GET', '/gost-config/compare');
  log.result(`${mode}下比较配置`, compareConfigResult);
  
  // 调试版本的比较配置
  const compareDebugResult = await makeRequest('GET', '/gost-config/compare-debug');
  log.result(`${mode}下调试比较配置`, compareDebugResult);
}

// 配置同步测试
async function testConfigSync() {
  log.info('测试配置同步功能...');
  
  // 手动同步配置
  const syncConfigResult = await makeRequest('POST', '/gost-config/sync');
  log.result('手动同步配置', syncConfigResult);
  
  // 获取同步状态
  const syncStatusResult = await makeRequest('GET', '/gost-config/sync-status');
  log.result('获取同步状态', syncStatusResult);
  
  // 获取配置统计
  const configStatsResult = await makeRequest('GET', '/gost-config/stats');
  log.result('获取配置统计', configStatsResult);
}

// 流量统计测试
async function testTrafficStats() {
  log.info('测试流量统计功能...');
  
  // 获取总流量统计
  const totalTrafficResult = await makeRequest('GET', '/traffic/stats');
  log.result('获取总流量统计', totalTrafficResult);
  
  // 获取用户流量统计
  if (userId) {
    const userTrafficResult = await makeRequest('GET', `/traffic/user/${userId}`);
    log.result('获取用户流量统计', userTrafficResult);
  } else {
    log.skip('获取用户流量统计', '没有有效的测试用户ID');
  }
  
  // 获取实时流量监控状态
  const monitorStatusResult = await makeRequest('GET', '/gost-config/realtime-monitor-status');
  log.result('获取实时流量监控状态', monitorStatusResult);
}

// 配额管理测试
async function testQuotaManagement() {
  if (!userId) {
    log.skip('配额管理测试', '没有有效的测试用户ID');
    return;
  }
  
  log.info('测试配额管理功能...');
  
  // 获取用户配额状态
  const quotaStatusResult = await makeRequest('GET', `/quota/user/${userId}`);
  log.result('获取用户配额状态', quotaStatusResult);
  
  // 更新用户配额
  const updateQuotaResult = await makeRequest('PUT', `/quota/user/${userId}`, {
    trafficQuota: 10 // 10GB
  });
  log.result('更新用户配额', updateQuotaResult);
  
  // 重置用户流量
  const resetTrafficResult = await makeRequest('POST', `/quota/reset/${userId}`);
  log.result('重置用户流量', resetTrafficResult);
}

// 清理测试数据
async function cleanupTestData() {
  log.info('清理测试数据...');
  
  // 删除测试规则
  if (testRuleId) {
    const deleteRuleResult = await makeRequest('DELETE', `/userForwardRules/${testRuleId}`);
    log.result('删除测试规则', deleteRuleResult);
  } else {
    log.skip('删除测试规则', '没有有效的测试规则ID');
  }
  
  // 删除测试用户
  if (userId) {
    const deleteUserResult = await makeRequest('DELETE', `/users/${userId}`);
    log.result('删除测试用户', deleteUserResult);
  } else {
    log.skip('删除测试用户', '没有有效的测试用户ID');
  }
}

// 输出测试结果
function logTestResults() {
  console.log('\n' + '-'.repeat(50));
  console.log(`\x1b[1m测试结果汇总:\x1b[0m`);
  console.log(`\x1b[1m总测试数: ${testResults.total}\x1b[0m`);
  console.log(`\x1b[32m通过: ${testResults.passed}\x1b[0m`);
  console.log(`\x1b[31m失败: ${testResults.failed}\x1b[0m`);
  console.log(`\x1b[33m跳过: ${testResults.skipped}\x1b[0m`);
  console.log('-'.repeat(50) + '\n');
  
  if (testResults.failed > 0) {
    log.error('测试完成，但有失败项');
    process.exit(1);
  } else {
    log.success('所有测试通过！');
    process.exit(0);
  }
}

// 运行测试
runTests().catch(error => {
  log.error(`测试过程中发生错误: ${error.message}`);
  console.error(error);
  process.exit(1);
}); 