/**
 * 简单观察器测试 - 验证观察器是否正常工作
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

async function simpleObserverTest() {
  console.log('🔍 开始简单观察器测试...\n');
  
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
    // 1. 获取初始流量
    console.log('1. 获取初始流量状态...');
    const initialResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
      'Authorization': authToken
    });
    
    let initialAdminTraffic = 0;
    let initialTestTraffic = 0;
    
    if (initialResponse.statusCode === 200) {
      const adminUser = initialResponse.data.find(u => u.username === 'admin');
      const testUser = initialResponse.data.find(u => u.username === 'test');
      
      initialAdminTraffic = adminUser ? (adminUser.usedTraffic || 0) : 0;
      initialTestTraffic = testUser ? (testUser.usedTraffic || 0) : 0;
      
      console.log(`  admin: ${formatBytes(initialAdminTraffic)}`);
      console.log(`  test: ${formatBytes(initialTestTraffic)}`);
    }

    // 2. 发送观察器数据
    console.log('\n2. 发送观察器数据...');
    
    const testBytes = 10 * 1024 * 1024; // 10MB
    
    const observerData = {
      events: [
        {
          kind: "service",
          service: "forward-tcp-6443",
          type: "stats",
          stats: {
            totalConns: 1,
            currentConns: 0,
            inputBytes: Math.floor(testBytes * 0.4),  // 4MB
            outputBytes: Math.floor(testBytes * 0.6), // 6MB
            totalErrs: 0
          }
        }
      ]
    };

    console.log(`📤 发送观察器数据:`);
    console.log(`   服务: forward-tcp-6443`);
    console.log(`   输入: ${formatBytes(observerData.events[0].stats.inputBytes)}`);
    console.log(`   输出: ${formatBytes(observerData.events[0].stats.outputBytes)}`);
    console.log(`   总计: ${formatBytes(testBytes)}`);
    
    const observerResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', observerData);
    
    if (observerResponse.statusCode === 200) {
      console.log('✅ 观察器数据发送成功');
      console.log('📊 响应:', observerResponse.data);
    } else {
      console.log('❌ 观察器数据发送失败:', observerResponse.statusCode, observerResponse.data);
      return;
    }

    // 3. 等待处理完成
    console.log('\n3. 等待处理完成...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 4. 获取最终流量
    console.log('\n4. 获取最终流量状态...');
    const finalResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
      'Authorization': authToken
    });
    
    if (finalResponse.statusCode === 200) {
      const adminUser = finalResponse.data.find(u => u.username === 'admin');
      const testUser = finalResponse.data.find(u => u.username === 'test');
      
      const finalAdminTraffic = adminUser ? (adminUser.usedTraffic || 0) : 0;
      const finalTestTraffic = testUser ? (testUser.usedTraffic || 0) : 0;
      
      const adminIncrement = finalAdminTraffic - initialAdminTraffic;
      const testIncrement = finalTestTraffic - initialTestTraffic;
      
      console.log(`📈 最终流量状态:`);
      console.log(`  admin: ${formatBytes(finalAdminTraffic)} (增量: ${formatBytes(adminIncrement)})`);
      console.log(`  test: ${formatBytes(finalTestTraffic)} (增量: ${formatBytes(testIncrement)})`);
      
      // 5. 分析结果
      console.log('\n📊 简单观察器测试分析:');
      console.log('='.repeat(50));
      console.log(`📤 发送数据: ${formatBytes(testBytes)}`);
      console.log(`📈 Admin增量: ${formatBytes(adminIncrement)}`);
      console.log(`📈 Test增量: ${formatBytes(testIncrement)}`);
      console.log(`📈 总增量: ${formatBytes(adminIncrement + testIncrement)}`);
      
      if (adminIncrement === testBytes) {
        console.log('✅ 观察器工作正常！Admin用户流量正确增加');
      } else if (adminIncrement === 0 && testIncrement === 0) {
        console.log('❌ 观察器没有更新任何用户流量！');
        console.log('🔍 可能原因:');
        console.log('   1. 观察器处理逻辑有问题');
        console.log('   2. 端口用户映射失败');
        console.log('   3. 数据库更新失败');
        console.log('   4. GOST配置问题');
      } else {
        console.log('⚠️ 观察器工作异常！流量增量不匹配');
        console.log(`   预期: ${formatBytes(testBytes)}`);
        console.log(`   实际: ${formatBytes(adminIncrement + testIncrement)}`);
      }
    }

    console.log('\n📊 简单观察器测试完成');

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  }
}

simpleObserverTest();
