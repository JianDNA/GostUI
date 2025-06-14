/**
 * 温和增量测试 - 降低频率，避免数据库压力
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function gentlePortTest(authToken, port, userId, username, iterations) {
  const stats = {
    port,
    userId,
    username,
    changes: 0,
    errors: 0,
    totalSimulated: 0,
    startTime: Date.now()
  };

  console.log(`🚀 启动端口 ${port} (${username}) 的温和测试，${iterations}次迭代`);

  for (let i = 0; i < iterations; i++) {
    try {
      // 🔧 使用与修复后的超级极限测试相同的逻辑
      const GENTLE_MODES = [
        { name: '微小数据包', min: 1024, max: 4096, weight: 30 },
        { name: '小文件传输', min: 10 * 1024, max: 100 * 1024, weight: 35 },
        { name: '中等文件', min: 1024 * 1024, max: 5 * 1024 * 1024, weight: 25 },
        { name: '大文件传输', min: 5 * 1024 * 1024, max: 20 * 1024 * 1024, weight: 10 }
      ];

      // 随机选择流量模式
      const totalWeight = GENTLE_MODES.reduce((sum, mode) => sum + mode.weight, 0);
      let randomWeight = Math.random() * totalWeight;
      let selectedMode = GENTLE_MODES[0];

      for (const mode of GENTLE_MODES) {
        randomWeight -= mode.weight;
        if (randomWeight <= 0) {
          selectedMode = mode;
          break;
        }
      }

      const incrementBytes = Math.floor(Math.random() * (selectedMode.max - selectedMode.min + 1)) + selectedMode.min;
      stats.totalSimulated += incrementBytes;

      const observerData = {
        events: [
          {
            kind: "service",
            service: `forward-tcp-${port}`,
            type: "stats",
            stats: {
              totalConns: stats.changes + 1,
              currentConns: Math.floor(Math.random() * 5),
              // 🔧 发送增量数据（与修复后的超级极限测试相同）
              inputBytes: Math.floor(incrementBytes * 0.4),
              outputBytes: Math.floor(incrementBytes * 0.6),
              totalErrs: 0
            }
          }
        ]
      };

      const response = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', observerData);
      
      if (response.statusCode === 200) {
        stats.changes++;
        console.log(`📊 端口 ${port}: 第${stats.changes}次成功，增量${formatBytes(incrementBytes)}`);
      } else {
        stats.errors++;
        console.log(`❌ 端口 ${port}: 第${i+1}次失败，状态码${response.statusCode}`);
      }

      // 🔧 温和的延迟：1秒
      await sleep(1000);

    } catch (error) {
      stats.errors++;
      console.log(`❌ 端口 ${port}: 第${i+1}次异常:`, error.message);
      await sleep(1000);
    }
  }

  return stats;
}

async function gentleTest() {
  console.log('🔍 开始温和增量测试...\n');
  
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
        reason: '温和增量测试'
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
    await sleep(3000);

    // 4. 获取初始流量
    console.log('\n3. 获取初始流量状态...');
    const initialResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
      'Authorization': authToken
    });
    
    if (initialResponse.statusCode === 200) {
      for (const user of initialResponse.data) {
        console.log(`  ${user.username}: ${formatBytes(user.usedTraffic || 0)}`);
      }
    }

    // 5. 启动温和测试
    console.log('\n4. 启动温和增量测试...');
    console.log('📊 测试参数:');
    console.log('   每个端口: 20次迭代');
    console.log('   每次增量: 5-15MB随机（真实增量数据）');
    console.log('   发送延迟: 1秒（温和频率）');
    console.log('   🔧 关键：发送增量数据，避免数据库压力');
    
    const iterations = 20; // 每个端口20次迭代
    
    // 🔧 串行执行，避免并发压力
    console.log('\n🔄 串行执行测试，避免并发压力...');
    
    const results = [];
    
    // 依次测试每个端口
    for (const portConfig of [
      { port: 6443, userId: 1, username: 'admin' },
      { port: 2999, userId: 2, username: 'test' },
      { port: 8080, userId: 1, username: 'admin' }
    ]) {
      console.log(`\n🚀 开始测试端口 ${portConfig.port} (${portConfig.username})...`);
      const result = await gentlePortTest(authToken, portConfig.port, portConfig.userId, portConfig.username, iterations);
      results.push(result);
      
      // 端口间等待
      console.log(`✅ 端口 ${portConfig.port} 测试完成，等待5秒...`);
      await sleep(5000);
    }

    // 最终统计
    console.log('\n🔥 温和增量测试完成！\n');
    
    let totalRequests = 0;
    let totalErrors = 0;
    let totalSimulated = 0;

    results.forEach((stats) => {
      totalRequests += stats.changes;
      totalErrors += stats.errors;
      totalSimulated += stats.totalSimulated;
      
      console.log(`📊 端口 ${stats.port} (${stats.username}):`);
      console.log(`   变化次数: ${stats.changes}`);
      console.log(`   模拟流量: ${formatBytes(stats.totalSimulated)}`);
      console.log(`   错误次数: ${stats.errors}`);
      console.log(`   成功率: ${((stats.changes / (stats.changes + stats.errors)) * 100).toFixed(2)}%\n`);
    });

    // 等待处理完成
    await sleep(5000);

    // 获取最终用户流量
    console.log('📈 最终流量统计:');
    const finalResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
      'Authorization': authToken
    });
    
    let finalTotalTraffic = 0;
    if (finalResponse.statusCode === 200) {
      for (const user of finalResponse.data) {
        const traffic = user.usedTraffic || 0;
        finalTotalTraffic += traffic;
        console.log(`  ${user.username}: ${formatBytes(traffic)}`);
      }
    }

    // 最终分析
    console.log('\n📈 温和增量测试分析:');
    console.log('='.repeat(60));
    console.log(`📡 总请求数: ${totalRequests.toLocaleString()}`);
    console.log(`✅ 成功率: ${((totalRequests / (totalRequests + totalErrors)) * 100).toFixed(2)}%`);
    console.log(`❌ 错误次数: ${totalErrors}`);
    console.log(`📊 模拟总流量: ${formatBytes(totalSimulated)}`);
    console.log(`📊 用户总流量: ${formatBytes(finalTotalTraffic)}`);
    console.log(`📊 流量差异: ${formatBytes(Math.abs(totalSimulated - finalTotalTraffic))}`);
    
    const ratio = totalSimulated > 0 ? (finalTotalTraffic / totalSimulated).toFixed(2) : 0;
    console.log(`📊 放大倍数: ${ratio}x`);
    
    const isAccurate = Math.abs(totalSimulated - finalTotalTraffic) < totalSimulated * 0.05;
    console.log(`🔧 数据一致性: ${isAccurate ? '✅ 优秀' : '⚠️ 需优化'}`);
    
    if (isAccurate) {
      console.log('\n🎉 温和增量测试通过！流量计算准确。');
      console.log('✅ 重构后的观察器处理逻辑工作正常');
      console.log('✅ GOST resetTraffic=true 模式完全兼容');
    } else {
      console.log('\n⚠️ 温和增量测试仍有问题！');
      console.log('🔍 需要进一步调试观察器处理逻辑');
    }

    console.log('\n📊 温和增量测试完成');

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  }
}

gentleTest();
