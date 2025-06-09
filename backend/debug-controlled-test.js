/**
 * 精确控制测试 - 模拟超级极限测试的逻辑，但使用精确控制的数据量
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function controlledPortTest(authToken, port, userId, username, iterations) {
  const stats = {
    port,
    userId,
    username,
    changes: 0,
    errors: 0,
    totalSimulated: 0,
    lastCumulative: 0
  };

  console.log(`🚀 启动端口 ${port} (${username}) 的精确控制测试，${iterations}次迭代`);

  for (let i = 0; i < iterations; i++) {
    try {
      // 🔧 精确控制：每次固定增加10MB
      const incrementBytes = 10 * 1024 * 1024; // 10MB
      stats.lastCumulative += incrementBytes;
      stats.totalSimulated += incrementBytes;
      
      const observerData = {
        events: [
          {
            kind: "service",
            service: `forward-tcp-${port}`,
            type: "stats",
            stats: {
              totalConns: stats.changes + 1,
              currentConns: 0,
              inputBytes: Math.floor(stats.lastCumulative * 0.4),
              outputBytes: Math.floor(stats.lastCumulative * 0.6),
              totalErrs: 0
            }
          }
        ]
      };

      const response = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', observerData);
      
      if (response.statusCode === 200) {
        stats.changes++;
      } else {
        stats.errors++;
      }

      // 每10次报告一次
      if ((i + 1) % 10 === 0) {
        console.log(`📊 端口 ${port}: ${i + 1}/${iterations} 完成，累积模拟: ${formatBytes(stats.totalSimulated)}`);
      }

      // 短暂延迟
      await sleep(50);

    } catch (error) {
      stats.errors++;
      await sleep(10);
    }
  }

  return stats;
}

async function controlledTest() {
  console.log('🔍 开始精确控制测试...\n');
  
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
        reason: '精确控制测试'
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
    await sleep(2000);

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

    // 5. 启动精确控制测试
    console.log('\n4. 启动精确控制测试...');
    console.log('📊 测试参数:');
    console.log('   每个端口: 50次迭代');
    console.log('   每次增量: 10MB');
    console.log('   预期每端口总流量: 500MB');
    console.log('   预期admin总流量: 1000MB (两个端口)');
    console.log('   预期test总流量: 500MB (一个端口)');
    
    const iterations = 50; // 每个端口50次迭代
    
    const portTests = [
      controlledPortTest(authToken, 6443, 1, 'admin', iterations),
      controlledPortTest(authToken, 2999, 2, 'test', iterations),
      controlledPortTest(authToken, 8080, 1, 'admin', iterations)
    ];

    // 等待所有测试完成
    const results = await Promise.allSettled(portTests);

    // 最终统计
    console.log('\n🔥 精确控制测试完成！\n');
    
    let totalRequests = 0;
    let totalErrors = 0;
    let totalSimulated = 0;

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const stats = result.value;
        totalRequests += stats.changes;
        totalErrors += stats.errors;
        totalSimulated += stats.totalSimulated;
        
        console.log(`📊 端口 ${stats.port} (${stats.username}):`);
        console.log(`   变化次数: ${stats.changes}`);
        console.log(`   模拟流量: ${formatBytes(stats.totalSimulated)}`);
        console.log(`   错误次数: ${stats.errors}`);
        console.log(`   成功率: ${((stats.changes / (stats.changes + stats.errors)) * 100).toFixed(2)}%\n`);
      }
    });

    // 等待处理完成
    await sleep(3000);

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
    console.log('\n📈 精确控制测试分析:');
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
      console.log('\n🎉 精确控制测试通过！流量计算准确。');
    } else {
      console.log('\n⚠️ 精确控制测试发现问题！');
      console.log('可能原因:');
      if (finalTotalTraffic > totalSimulated) {
        console.log('  1. 观察器数据被重复处理');
        console.log('  2. 累积统计计算错误');
        console.log('  3. 高频请求导致的竞态条件');
      } else {
        console.log('  1. 观察器数据丢失');
        console.log('  2. 数据库更新失败');
      }
    }

    console.log('\n📊 精确控制测试完成');

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  }
}

controlledTest();
