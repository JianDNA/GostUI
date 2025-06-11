/**
 * 配额问题诊断脚本
 */

const http = require('http');

function makeHttpRequest(method, url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout: 10000
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const data = body ? JSON.parse(body) : {};
          resolve({ statusCode: res.statusCode, data });
        } catch (error) {
          resolve({ statusCode: res.statusCode, data: body });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function getAuthToken() {
  const loginData = { username: 'admin', password: 'admin123' };
  const response = await makeHttpRequest('POST', 'http://localhost:3000/api/auth/login', loginData);
  
  if (response.statusCode === 200 && response.data.token) {
    return `Bearer ${response.data.token}`;
  } else {
    throw new Error('登录失败');
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)}${units[unitIndex]}`;
}

async function diagnoseQuotaIssue() {
  console.log('🔍 开始配额问题诊断...\n');
  
  let authToken;
  try {
    authToken = await getAuthToken();
    console.log('✅ 登录成功\n');
  } catch (error) {
    console.error('❌ 登录失败:', error.message);
    return;
  }

  try {
    // 1. 检查数据库中的用户信息
    console.log('1. 检查数据库中的用户信息...');
    const { User } = require('./models');
    
    const user = await User.findByPk(2, {
      attributes: ['id', 'username', 'role', 'trafficQuota', 'usedTraffic', 'isActive', 'userStatus']
    });

    if (user) {
      console.log('📊 数据库中的用户信息:');
      console.log(`   用户ID: ${user.id}`);
      console.log(`   用户名: ${user.username}`);
      console.log(`   角色: ${user.role}`);
      console.log(`   状态: ${user.userStatus} (活跃: ${user.isActive})`);
      console.log(`   配额: ${user.trafficQuota}GB`);
      console.log(`   已用流量: ${user.usedTraffic} bytes (${formatBytes(user.usedTraffic || 0)})`);
      
      // 手动计算使用率
      if (user.trafficQuota && user.trafficQuota > 0) {
        const quotaBytes = user.trafficQuota * 1024 * 1024 * 1024;
        const usagePercentage = ((user.usedTraffic || 0) / quotaBytes * 100).toFixed(2);
        console.log(`   手动计算使用率: ${usagePercentage}%`);
        console.log(`   配额字节数: ${quotaBytes} bytes (${formatBytes(quotaBytes)})`);
        
        if (parseFloat(usagePercentage) >= 100) {
          console.log('   ❌ 应该被限制：使用率 >= 100%');
        } else {
          console.log('   ✅ 应该允许：使用率 < 100%');
        }
      }
    } else {
      console.log('❌ 用户不存在');
      return;
    }

    // 2. 检查配额管理服务
    console.log('\n2. 检查配额管理服务...');
    const quotaManagementService = require('./services/quotaManagementService');
    
    // 清除缓存
    quotaManagementService.clearAllQuotaCache();
    
    const quotaStatus = await quotaManagementService.checkUserQuotaStatus(2);
    console.log('📊 配额管理服务返回:');
    console.log(`   状态: ${quotaStatus.status}`);
    console.log(`   允许访问: ${quotaStatus.allowed}`);
    console.log(`   告警级别: ${quotaStatus.alertLevel}`);
    console.log(`   使用率: ${quotaStatus.usagePercentage}%`);
    console.log(`   原因: ${quotaStatus.reason}`);
    
    if (quotaStatus.usedTraffic !== undefined) {
      console.log(`   已用流量: ${quotaStatus.usedTraffic} bytes (${formatBytes(quotaStatus.usedTraffic)})`);
    }
    if (quotaStatus.quotaBytes !== undefined) {
      console.log(`   配额字节: ${quotaStatus.quotaBytes} bytes (${formatBytes(quotaStatus.quotaBytes)})`);
    }

    // 3. 检查限制器服务
    console.log('\n3. 检查限制器服务...');
    const gostLimiterService = require('./services/gostLimiterService');
    
    // 清除缓存
    gostLimiterService.clearAllQuotaCache();
    
    const limiterRequest = {
      scope: 'client',
      service: 'forward-tcp-2999',
      network: 'tcp',
      addr: 'test.com:443',
      client: 'user_2',
      src: '127.0.0.1:12345'
    };
    
    const limiterResponse = await gostLimiterService.handleLimiterRequest(limiterRequest);
    console.log('📊 限制器服务返回:');
    console.log(`   输入限制: ${limiterResponse.in}`);
    console.log(`   输出限制: ${limiterResponse.out}`);
    
    if (limiterResponse.in === 0 && limiterResponse.out === 0) {
      console.log('   🚫 限制器正确阻止访问');
    } else if (limiterResponse.in === -1 && limiterResponse.out === -1) {
      console.log('   ✅ 限制器允许访问');
    } else {
      console.log('   ⚠️ 限制器返回异常值');
    }

    // 4. 检查API返回
    console.log('\n4. 检查API返回...');
    const apiResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/quota/status/2', null, {
      'Authorization': authToken
    });
    
    if (apiResponse.statusCode === 200) {
      const apiStatus = apiResponse.data.data;
      console.log('📊 API返回:');
      console.log(`   状态: ${apiStatus.status}`);
      console.log(`   允许访问: ${apiStatus.allowed}`);
      console.log(`   告警级别: ${apiStatus.alertLevel}`);
      console.log(`   使用率: ${apiStatus.usagePercentage}%`);
      console.log(`   原因: ${apiStatus.reason}`);
    }

    // 5. 强制设置正确的配额
    console.log('\n5. 强制设置正确的配额...');
    
    // 确保配额设置为100MB = 0.1GB
    const updateResponse = await makeHttpRequest('PUT', 'http://localhost:3000/api/users/2', {
      trafficQuota: 0.1
    }, {
      'Authorization': authToken
    });
    
    if (updateResponse.statusCode === 200) {
      console.log('✅ 配额已强制设置为0.1GB (100MB)');
    } else {
      console.log('❌ 配额设置失败');
    }

    // 6. 清除所有缓存并重新检查
    console.log('\n6. 清除所有缓存并重新检查...');
    
    quotaManagementService.clearAllQuotaCache();
    gostLimiterService.clearAllQuotaCache();
    
    const finalQuotaStatus = await quotaManagementService.checkUserQuotaStatus(2);
    console.log('📊 清除缓存后的配额状态:');
    console.log(`   状态: ${finalQuotaStatus.status}`);
    console.log(`   允许访问: ${finalQuotaStatus.allowed}`);
    console.log(`   告警级别: ${finalQuotaStatus.alertLevel}`);
    console.log(`   使用率: ${finalQuotaStatus.usagePercentage}%`);
    
    const finalLimiterResponse = await gostLimiterService.handleLimiterRequest(limiterRequest);
    console.log('📊 清除缓存后的限制器状态:');
    console.log(`   输入限制: ${finalLimiterResponse.in}`);
    console.log(`   输出限制: ${finalLimiterResponse.out}`);

    // 7. 诊断结论
    console.log('\n' + '='.repeat(60));
    console.log('🔍 诊断结论:');
    console.log('='.repeat(60));
    
    const currentUsage = parseFloat(finalQuotaStatus.usagePercentage);
    
    if (currentUsage >= 100 && !finalQuotaStatus.allowed) {
      console.log('✅ 系统工作正常：配额超限，访问被正确禁止');
    } else if (currentUsage >= 100 && finalQuotaStatus.allowed) {
      console.log('❌ 系统异常：配额超限但仍允许访问');
      console.log('🔧 可能的问题：');
      console.log('   - 配额计算逻辑错误');
      console.log('   - 缓存同步问题');
      console.log('   - 限制器逻辑错误');
    } else if (currentUsage < 100 && finalQuotaStatus.allowed) {
      console.log('✅ 系统工作正常：配额未超限，允许访问');
    } else {
      console.log('❌ 系统异常：配额未超限但被禁止访问');
    }

  } catch (error) {
    console.error('❌ 诊断过程中发生错误:', error);
  } finally {
    process.exit(0);
  }
}

diagnoseQuotaIssue();
