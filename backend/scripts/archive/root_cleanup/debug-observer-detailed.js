/**
 * 详细的观察器处理调试脚本
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

async function debugObserverDetailed() {
  console.log('🔍 开始详细的观察器处理调试...\n');
  
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
    // 1. 重置test用户流量，确保从0开始
    console.log('1. 重置test用户流量...');
    const resetResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/quota/reset/2', {
      reason: '详细调试测试'
    }, {
      'Authorization': authToken
    });
    
    if (resetResponse.statusCode === 200) {
      console.log('✅ Test用户流量重置成功');
    }

    await sleep(3000);

    // 2. 获取重置后的初始状态
    console.log('\n2. 获取重置后的初始状态...');
    const initialResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
      'Authorization': authToken
    });
    
    if (initialResponse.statusCode === 200) {
      console.log('📊 重置后初始流量状态:');
      initialResponse.data.forEach(user => {
        console.log(`  ${user.username}: ${formatBytes(user.usedTraffic || 0)}`);
      });
    }

    // 3. 发送精确的观察器数据
    console.log('\n3. 发送精确的观察器数据...');
    
    const testData = [
      { name: '10MB测试', inputGB: 0, outputGB: 0, inputMB: 5, outputMB: 5 },
      { name: '1GB测试', inputGB: 0.5, outputGB: 0.5, inputMB: 0, outputMB: 0 },
      { name: '10GB测试', inputGB: 5, outputGB: 5, inputMB: 0, outputMB: 0 }
    ];

    for (const test of testData) {
      console.log(`\n📤 发送 ${test.name}...`);
      
      const inputBytes = (test.inputGB * 1024 * 1024 * 1024) + (test.inputMB * 1024 * 1024);
      const outputBytes = (test.outputGB * 1024 * 1024 * 1024) + (test.outputMB * 1024 * 1024);
      const totalBytes = inputBytes + outputBytes;
      
      console.log(`   输入: ${formatBytes(inputBytes)}`);
      console.log(`   输出: ${formatBytes(outputBytes)}`);
      console.log(`   总计: ${formatBytes(totalBytes)}`);
      
      const observerData = {
        events: [
          {
            kind: "service",
            service: "forward-tcp-2999",
            type: "stats",
            stats: {
              totalConns: 1,
              currentConns: 1,
              inputBytes: inputBytes,
              outputBytes: outputBytes,
              totalErrs: 0
            }
          }
        ]
      };

      const observerResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', observerData);
      
      if (observerResponse.statusCode === 200) {
        console.log('✅ 观察器响应成功');
      } else {
        console.log('❌ 观察器响应失败:', observerResponse.statusCode);
      }

      // 等待处理完成
      await sleep(5000);

      // 检查处理后的状态
      const afterResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
        'Authorization': authToken
      });
      
      if (afterResponse.statusCode === 200) {
        console.log('📊 处理后流量状态:');
        afterResponse.data.forEach(user => {
          if (user.id === 2) { // test用户
            const currentTraffic = user.usedTraffic || 0;
            console.log(`  ${user.username}: ${formatBytes(currentTraffic)}`);
            
            // 计算预期流量
            const expectedTraffic = totalBytes;
            const difference = Math.abs(currentTraffic - expectedTraffic);
            
            if (difference < 1024) { // 1KB容差
              console.log(`  ✅ 流量更新正确 (差异: ${difference} bytes)`);
            } else {
              console.log(`  ❌ 流量更新异常 (预期: ${formatBytes(expectedTraffic)}, 实际: ${formatBytes(currentTraffic)}, 差异: ${formatBytes(difference)})`);
            }
          }
        });
      }

      // 检查配额状态
      const quotaResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/quota/status/2', null, {
        'Authorization': authToken
      });
      
      if (quotaResponse.statusCode === 200) {
        const status = quotaResponse.data.data;
        console.log(`📊 配额状态: ${status.status} (${status.usagePercentage}%)`);
        
        // 计算预期使用率
        const user2 = afterResponse.data.find(u => u.id === 2);
        if (user2 && user2.trafficQuota) {
          const expectedPercentage = ((user2.usedTraffic || 0) / (user2.trafficQuota * 1024 * 1024 * 1024) * 100).toFixed(2);
          console.log(`📊 预期使用率: ${expectedPercentage}%`);
          
          if (Math.abs(parseFloat(status.usagePercentage) - parseFloat(expectedPercentage)) < 0.01) {
            console.log('✅ 配额计算正确');
          } else {
            console.log('❌ 配额计算异常');
          }
        }
      }

      console.log('─'.repeat(50));
    }

    // 4. 最终状态检查
    console.log('\n4. 最终状态检查...');
    
    const finalResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
      'Authorization': authToken
    });
    
    if (finalResponse.statusCode === 200) {
      console.log('📊 最终流量状态:');
      finalResponse.data.forEach(user => {
        const usedTraffic = formatBytes(user.usedTraffic || 0);
        const quota = user.trafficQuota ? `${user.trafficQuota}GB` : '无限制';
        const percentage = user.trafficQuota ? 
          ((user.usedTraffic || 0) / (user.trafficQuota * 1024 * 1024 * 1024) * 100).toFixed(4) + '%' : 
          'N/A';
        
        console.log(`  ${user.username}: ${usedTraffic} / ${quota} (${percentage})`);
      });
    }

    console.log('\n🔍 详细观察器处理调试完成');

  } catch (error) {
    console.error('❌ 调试过程中发生错误:', error);
  }
}

debugObserverDetailed();
