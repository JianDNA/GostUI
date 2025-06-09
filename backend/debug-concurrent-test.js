/**
 * 并发调试测试 - 验证多端口同时发送数据的处理
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
      timeout: 5000
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

async function sendObserverData(port, userId, cumulativeBytes) {
  const observerData = {
    events: [
      {
        kind: "service",
        service: `forward-tcp-${port}`,
        type: "stats",
        stats: {
          totalConns: 1,
          currentConns: 0,
          inputBytes: Math.floor(cumulativeBytes * 0.4),
          outputBytes: Math.floor(cumulativeBytes * 0.6),
          totalErrs: 0
        }
      }
    ]
  };

  const response = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', observerData);
  return response.statusCode === 200;
}

async function concurrentTest() {
  console.log('🔍 开始并发调试测试...\n');
  
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
    // 1. 重置所有用户流量
    console.log('1. 重置所有用户流量...');
    
    const resetUsers = [
      { id: 1, name: 'admin' },
      { id: 2, name: 'test' }
    ];

    for (const user of resetUsers) {
      const resetResponse = await makeHttpRequest('POST', `http://localhost:3000/api/users/${user.id}/reset-traffic`, {
        reason: '并发调试测试'
      }, {
        'Authorization': authToken
      });
      
      if (resetResponse.statusCode === 200) {
        console.log(`✅ 用户 ${user.name} 流量重置成功`);
      } else {
        console.log(`⚠️ 用户 ${user.name} 流量重置失败:`, resetResponse.data);
      }
    }

    // 2. 清理观察器累积统计
    console.log('\n2. 清理观察器累积统计...');
    const clearResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/clear-stats', {}, {
      'Authorization': authToken
    });
    
    if (clearResponse.statusCode === 200) {
      console.log('✅ 观察器累积统计清理成功');
    } else {
      console.log('⚠️ 观察器累积统计清理失败:', clearResponse.data);
    }

    // 3. 等待处理完成
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. 获取初始流量
    console.log('\n3. 获取初始流量状态...');
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
      
      console.log(`✅ Admin 用户初始流量: ${formatBytes(initialAdminTraffic)}`);
      console.log(`✅ Test 用户初始流量: ${formatBytes(initialTestTraffic)}`);
    }

    // 5. 并发发送观察器数据
    console.log('\n4. 并发发送观察器数据...');
    
    const testBytes = 50 * 1024 * 1024; // 每个端口50MB
    
    console.log(`📤 准备并发发送:`);
    console.log(`   端口6443 (admin): ${formatBytes(testBytes)}`);
    console.log(`   端口2999 (test):  ${formatBytes(testBytes)}`);
    console.log(`   端口8080 (admin): ${formatBytes(testBytes)}`);
    console.log(`   预期admin总流量: ${formatBytes(testBytes * 2)} (两个端口)`);
    console.log(`   预期test总流量:  ${formatBytes(testBytes)} (一个端口)`);

    // 同时发送三个观察器数据
    const promises = [
      sendObserverData(6443, 1, testBytes), // admin用户，端口6443
      sendObserverData(2999, 2, testBytes), // test用户，端口2999
      sendObserverData(8080, 1, testBytes)  // admin用户，端口8080
    ];

    const results = await Promise.all(promises);
    
    console.log(`✅ 并发发送完成: ${results.filter(r => r).length}/3 成功`);

    // 6. 等待处理完成
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 7. 获取最终流量
    console.log('\n5. 获取最终流量状态...');
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
      
      console.log(`📈 Admin 用户最终流量: ${formatBytes(finalAdminTraffic)}`);
      console.log(`📈 Test 用户最终流量: ${formatBytes(finalTestTraffic)}`);
      
      console.log(`\n📊 Admin 用户分析:`);
      console.log(`   实际增量: ${formatBytes(adminIncrement)}`);
      console.log(`   预期增量: ${formatBytes(testBytes * 2)}`);
      console.log(`   差异: ${formatBytes(Math.abs(adminIncrement - testBytes * 2))}`);
      
      const adminRatio = testBytes * 2 > 0 ? (adminIncrement / (testBytes * 2)).toFixed(2) : 0;
      console.log(`   放大倍数: ${adminRatio}x`);
      
      console.log(`\n📊 Test 用户分析:`);
      console.log(`   实际增量: ${formatBytes(testIncrement)}`);
      console.log(`   预期增量: ${formatBytes(testBytes)}`);
      console.log(`   差异: ${formatBytes(Math.abs(testIncrement - testBytes))}`);
      
      const testRatio = testBytes > 0 ? (testIncrement / testBytes).toFixed(2) : 0;
      console.log(`   放大倍数: ${testRatio}x`);
      
      // 分析结果
      console.log(`\n🔍 并发测试分析:`);
      
      const adminCorrect = Math.abs(adminIncrement - testBytes * 2) < testBytes * 0.01;
      const testCorrect = Math.abs(testIncrement - testBytes) < testBytes * 0.01;
      
      if (adminCorrect && testCorrect) {
        console.log('✅ 并发处理正确，无竞态条件');
      } else {
        console.log('❌ 检测到并发处理问题');
        
        if (!adminCorrect) {
          console.log('⚠️ Admin用户多端口并发处理异常');
          console.log('   可能原因: 用户级别的锁机制失效');
        }
        
        if (!testCorrect) {
          console.log('⚠️ Test用户单端口处理异常');
          console.log('   可能原因: 观察器处理逻辑错误');
        }
      }
    }

    console.log('\n📊 并发调试测试完成');

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  }
}

concurrentTest();
