/**
 * 观察器处理调试脚本
 * 检查观察器数据处理流程
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
    throw new Error('登录失败: ' + (response.data.message || '未知错误'));
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0B';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(unitIndex === 0 ? 0 : 2)}${units[unitIndex]}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function debugObserverProcessing() {
  console.log('🔍 开始观察器处理调试...\n');
  
  let authToken;
  try {
    console.log('🔐 获取管理员 token...');
    authToken = await getAuthToken();
    console.log('✅ 登录成功\n');
  } catch (error) {
    console.error('❌ 获取 token 失败:', error.message);
    return;
  }

  try {
    // 1. 获取初始用户流量状态
    console.log('1. 获取初始用户流量状态...');
    const initialResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
      'Authorization': authToken
    });
    
    if (initialResponse.statusCode === 200) {
      console.log('📊 初始流量状态:');
      initialResponse.data.forEach(user => {
        console.log(`  ${user.username}: ${formatBytes(user.usedTraffic || 0)}`);
      });
    }

    // 2. 检查端口用户映射
    console.log('\n2. 检查端口用户映射...');
    const rulesResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/rules', null, {
      'Authorization': authToken
    });
    
    if (rulesResponse.statusCode === 200) {
      console.log('📊 转发规则:');
      rulesResponse.data.forEach(rule => {
        console.log(`  端口${rule.sourcePort} -> 用户${rule.userId} (${rule.isActive ? '活跃' : '非活跃'})`);
      });
    }

    // 3. 发送简单的观察器数据
    console.log('\n3. 发送简单的观察器数据...');
    
    const simpleObserverData = {
      events: [
        {
          kind: "service",
          service: "forward-tcp-2999",
          type: "stats",
          stats: {
            totalConns: 1,
            currentConns: 1,
            inputBytes: 1024 * 1024,      // 1MB
            outputBytes: 1024 * 1024,     // 1MB
            totalErrs: 0
          }
        }
      ]
    };

    console.log('📤 发送观察器数据:', JSON.stringify(simpleObserverData, null, 2));
    
    const observerResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', simpleObserverData);
    
    if (observerResponse.statusCode === 200) {
      console.log('✅ 观察器响应:', observerResponse.data);
    } else {
      console.log('❌ 观察器响应失败:', observerResponse.statusCode, observerResponse.data);
    }

    // 4. 等待处理完成
    console.log('\n4. 等待处理完成...');
    await sleep(5000);

    // 5. 检查处理后的用户流量状态
    console.log('\n5. 检查处理后的用户流量状态...');
    const afterResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
      'Authorization': authToken
    });
    
    if (afterResponse.statusCode === 200) {
      console.log('📊 处理后流量状态:');
      let hasChange = false;
      afterResponse.data.forEach(user => {
        const initialUser = initialResponse.data.find(u => u.id === user.id);
        const initialTraffic = initialUser ? initialUser.usedTraffic || 0 : 0;
        const currentTraffic = user.usedTraffic || 0;
        const change = currentTraffic - initialTraffic;
        
        console.log(`  ${user.username}: ${formatBytes(currentTraffic)} (变化: ${formatBytes(change)})`);
        if (change > 0) hasChange = true;
      });
      
      if (hasChange) {
        console.log('✅ 观察器数据处理正常');
      } else {
        console.log('❌ 观察器数据未被处理');
      }
    }

    // 6. 检查配额状态
    console.log('\n6. 检查配额状态...');
    const quotaResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/quota/status/2', null, {
      'Authorization': authToken
    });
    
    if (quotaResponse.statusCode === 200) {
      const status = quotaResponse.data.data;
      console.log('📊 配额状态:');
      console.log(`   状态: ${status.status}`);
      console.log(`   使用率: ${status.usagePercentage}%`);
      console.log(`   允许访问: ${status.allowed}`);
      console.log(`   告警级别: ${status.alertLevel}`);
    }

    // 7. 测试认证器
    console.log('\n7. 测试认证器...');
    const authTestResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/test-auth', {
      service: 'forward-tcp-2999'
    });
    
    if (authTestResponse.statusCode === 200) {
      console.log('✅ 认证器测试:', authTestResponse.data.response);
    } else {
      console.log('❌ 认证器测试失败');
    }

    // 8. 测试限制器
    console.log('\n8. 测试限制器...');
    const limiterTestResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/test-limiter', {
      userId: 2,
      service: 'forward-tcp-2999'
    });
    
    if (limiterTestResponse.statusCode === 200) {
      console.log('✅ 限制器测试:', limiterTestResponse.data.response);
    } else {
      console.log('❌ 限制器测试失败');
    }

    console.log('\n🔍 观察器处理调试完成');

  } catch (error) {
    console.error('❌ 调试过程中发生错误:', error);
  }
}

debugObserverProcessing();
