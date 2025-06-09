/**
 * 简单调试测试 - 验证单次观察器调用的流量处理
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

async function simpleTest() {
  console.log('🔍 开始简单调试测试...\n');
  
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
    // 1. 重置用户流量
    console.log('1. 重置 admin 用户流量...');
    const resetResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/users/1/reset-traffic', {
      reason: '简单调试测试'
    }, {
      'Authorization': authToken
    });
    
    if (resetResponse.statusCode === 200) {
      console.log('✅ admin 用户流量重置成功');
    } else {
      console.log('⚠️ admin 用户流量重置失败:', resetResponse.data);
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
    
    let initialTraffic = 0;
    if (initialResponse.statusCode === 200) {
      const adminUser = initialResponse.data.find(u => u.username === 'admin');
      initialTraffic = adminUser ? (adminUser.usedTraffic || 0) : 0;
      console.log(`✅ Admin 用户初始流量: ${formatBytes(initialTraffic)}`);
    }

    // 5. 发送单次观察器数据
    console.log('\n4. 发送单次观察器数据...');
    
    const testBytes = 100 * 1024 * 1024; // 100MB
    const observerData = {
      events: [
        {
          kind: "service",
          service: "forward-tcp-6443",
          type: "stats",
          stats: {
            totalConns: 1,
            currentConns: 0,
            inputBytes: Math.floor(testBytes * 0.4),  // 40MB
            outputBytes: Math.floor(testBytes * 0.6), // 60MB
            totalErrs: 0
          }
        }
      ]
    };

    console.log(`📤 发送观察器数据: 输入=${formatBytes(observerData.events[0].stats.inputBytes)}, 输出=${formatBytes(observerData.events[0].stats.outputBytes)}, 总计=${formatBytes(testBytes)}`);
    
    const observerResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', observerData);
    
    if (observerResponse.statusCode === 200) {
      console.log('✅ 观察器数据发送成功');
    } else {
      console.log('❌ 观察器数据发送失败:', observerResponse.data);
      return;
    }

    // 6. 等待处理完成
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 7. 获取最终流量
    console.log('\n5. 获取最终流量状态...');
    const finalResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
      'Authorization': authToken
    });
    
    if (finalResponse.statusCode === 200) {
      const adminUser = finalResponse.data.find(u => u.username === 'admin');
      const finalTraffic = adminUser ? (adminUser.usedTraffic || 0) : 0;
      const actualIncrement = finalTraffic - initialTraffic;
      
      console.log(`📈 Admin 用户最终流量: ${formatBytes(finalTraffic)}`);
      console.log(`📊 实际增量: ${formatBytes(actualIncrement)}`);
      console.log(`📊 预期增量: ${formatBytes(testBytes)}`);
      console.log(`📊 差异: ${formatBytes(Math.abs(actualIncrement - testBytes))}`);
      
      const ratio = testBytes > 0 ? (actualIncrement / testBytes).toFixed(2) : 0;
      console.log(`📊 放大倍数: ${ratio}x`);
      
      if (Math.abs(actualIncrement - testBytes) < testBytes * 0.01) {
        console.log('✅ 流量计算正确');
      } else {
        console.log('❌ 流量计算异常');
        
        if (actualIncrement > testBytes) {
          console.log('⚠️ 检测到流量放大问题');
          console.log('可能原因:');
          console.log('  1. 观察器数据被重复处理');
          console.log('  2. 累积统计计算错误');
          console.log('  3. 用户流量更新重复');
        }
      }
    }

    console.log('\n📊 简单调试测试完成');

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  }
}

simpleTest();
