/**
 * 系统诊断脚本 - 检查观察器和流量统计状态
 */

const http = require('http');

function makeHttpRequest(method, url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? require('https') : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout: 10000
    };

    const req = client.request(options, (res) => {
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
  
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
}

async function diagnoseSystem() {
  console.log('🔍 开始系统诊断...\n');
  
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
    // 1. 检查用户流量状态
    console.log('1. 检查用户流量状态...');
    const usersResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
      'Authorization': authToken
    });
    
    if (usersResponse.statusCode === 200) {
      console.log('📊 用户流量状态:');
      usersResponse.data.forEach(user => {
        console.log(`  ${user.username}: ${formatBytes(user.usedTraffic || 0)} (状态: ${user.userStatus})`);
      });
    } else {
      console.log('❌ 获取用户流量失败:', usersResponse.statusCode, usersResponse.data);
    }

    // 2. 检查转发规则
    console.log('\n2. 检查转发规则...');
    const rulesResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/rules', null, {
      'Authorization': authToken
    });
    
    if (rulesResponse.statusCode === 200) {
      console.log('📊 转发规则状态:');
      rulesResponse.data.forEach(rule => {
        console.log(`  规则${rule.id}: 端口${rule.sourcePort} -> ${rule.targetAddress} (用户${rule.userId}, 活跃: ${rule.isActive})`);
      });
    } else {
      console.log('❌ 获取转发规则失败:', rulesResponse.statusCode, rulesResponse.data);
    }

    // 3. 测试观察器端点
    console.log('\n3. 测试观察器端点...');
    
    const testObserverData = {
      events: [
        {
          kind: "service",
          service: "forward-tcp-6443",
          type: "stats",
          stats: {
            totalConns: 1,
            currentConns: 1,
            inputBytes: 1024,      // 1KB输入
            outputBytes: 4096,     // 4KB输出
            totalErrs: 0
          }
        }
      ]
    };

    console.log('📤 发送测试观察器数据...');
    const observerResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', testObserverData);
    
    if (observerResponse.statusCode === 200) {
      console.log('✅ 观察器端点响应正常:', observerResponse.data);
    } else {
      console.log('❌ 观察器端点异常:', observerResponse.statusCode, observerResponse.data);
    }

    // 4. 等待处理并检查结果
    console.log('\n4. 等待处理并检查结果...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const afterTestResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
      'Authorization': authToken
    });
    
    if (afterTestResponse.statusCode === 200) {
      console.log('📊 测试后用户流量:');
      let hasUpdate = false;
      afterTestResponse.data.forEach(user => {
        const traffic = user.usedTraffic || 0;
        console.log(`  ${user.username}: ${formatBytes(traffic)}`);
        if (traffic > 0) hasUpdate = true;
      });
      
      if (hasUpdate) {
        console.log('✅ 观察器处理正常，流量有更新');
      } else {
        console.log('❌ 观察器处理异常，流量没有更新');
      }
    }

    // 5. 检查系统健康状态
    console.log('\n5. 检查系统健康状态...');
    const healthResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/health', null, {
      'Authorization': authToken
    });
    
    if (healthResponse.statusCode === 200) {
      console.log('✅ 系统健康检查通过:', healthResponse.data);
    } else {
      console.log('⚠️ 系统健康检查异常:', healthResponse.statusCode, healthResponse.data);
    }

    // 6. 检查数据库连接
    console.log('\n6. 检查数据库连接...');
    try {
      const { sequelize } = require('./models');
      await sequelize.authenticate();
      console.log('✅ 数据库连接正常');
      
      // 检查数据库中的实际数据
      const { User } = require('./models');
      const users = await User.findAll({
        attributes: ['id', 'username', 'usedTraffic', 'userStatus']
      });
      
      console.log('📊 数据库中的用户数据:');
      users.forEach(user => {
        console.log(`  ${user.username}: ${formatBytes(user.usedTraffic || 0)} (状态: ${user.userStatus})`);
      });
      
    } catch (error) {
      console.log('❌ 数据库连接失败:', error.message);
    }

    console.log('\n🔍 系统诊断完成');

  } catch (error) {
    console.error('❌ 诊断过程中发生错误:', error);
  }
}

diagnoseSystem();
