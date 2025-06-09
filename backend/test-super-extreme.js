/**
 * 🔥 超级极限压力测试 - 3.5分钟1.5TB+流量挑战
 * 验证：系统在极限条件下的稳定性和准确性
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
      timeout: 2000 // 更短的超时时间增加压力
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

// 🔧 进一步修复：使用更合理的流量模式，确保数据一致性
const SUPER_EXTREME_MODES = [
  { name: '微小数据包', min: 1024, max: 4096, weight: 30 },           // 1-4KB
  { name: '小文件传输', min: 10 * 1024, max: 100 * 1024, weight: 35 }, // 10-100KB
  { name: '中等文件', min: 1024 * 1024, max: 5 * 1024 * 1024, weight: 25 }, // 1-5MB
  { name: '大文件传输', min: 5 * 1024 * 1024, max: 20 * 1024 * 1024, weight: 10 }, // 5-20MB
  // 🔧 移除更大的流量模式，确保测试的可控性
];

function selectRandomMode() {
  const totalWeight = SUPER_EXTREME_MODES.reduce((sum, mode) => sum + mode.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const mode of SUPER_EXTREME_MODES) {
    random -= mode.weight;
    if (random <= 0) {
      return mode;
    }
  }
  
  return SUPER_EXTREME_MODES[0];
}

function generateRandomTraffic(mode) {
  const size = Math.floor(Math.random() * (mode.max - mode.min + 1)) + mode.min;
  const inputRatio = 0.3 + Math.random() * 0.4; // 30%-70%的输入流量
  
  return {
    inputBytes: Math.floor(size * inputRatio),
    outputBytes: Math.floor(size * (1 - inputRatio)),
    totalBytes: size,
    mode: mode.name
  };
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

async function superExtremePortTest(authToken, port, userId, username, testDuration) {
  const stats = {
    port,
    userId,
    username,
    changes: 0,
    errors: 0,
    timeouts: 0,
    totalSimulated: 0,
    startTime: Date.now(),
    lastCumulative: 0
  };

  console.log(`🚀 启动端口 ${port} (${username}) 的超级极限测试`);

  const endTime = Date.now() + testDuration;
  
  while (Date.now() < endTime) {
    try {
      // 选择随机流量模式
      const mode = selectRandomMode();
      const traffic = generateRandomTraffic(mode);
      
      // 🔧 修复：正确的累积流量计算
      // 🔧 关键修复：发送增量数据，匹配GOST resetTraffic=true模式
      stats.totalSimulated += traffic.totalBytes;  // 我们模拟的增量总和

      const observerData = {
        events: [
          {
            kind: "service",
            service: `forward-tcp-${port}`,
            type: "stats",
            stats: {
              totalConns: stats.changes + 1,
              currentConns: Math.floor(Math.random() * 10),
              // 🔧 发送增量数据（而不是累积值）
              inputBytes: Math.floor(traffic.totalBytes * 0.4),  // 增量输入
              outputBytes: Math.floor(traffic.totalBytes * 0.6), // 增量输出
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

      // 每100次变化报告一次
      if (stats.changes % 100 === 0) {
        const elapsed = ((Date.now() - stats.startTime) / 1000 / 60).toFixed(1);
        console.log(`📊 端口 ${port} (${username}): ${stats.changes} 次变化`);
        console.log(`   累积流量: ${formatBytes(stats.totalSimulated)}`);
        console.log(`   当前模式: ${mode.name}`);
        console.log(`   错误次数: ${stats.errors}, 耗时: ${elapsed}分钟`);
      }

      // 动态调整频率 - 越到后期越快
      const progress = (Date.now() - stats.startTime) / testDuration;
      const baseDelay = 15; // 基础延迟15ms
      const dynamicDelay = Math.max(5, baseDelay * (1 - progress * 0.8)); // 最后阶段降到5ms
      
      await sleep(dynamicDelay);

    } catch (error) {
      if (error.message === 'Request timeout') {
        stats.timeouts++;
      } else {
        stats.errors++;
      }
      
      // 快速重试
      await sleep(5);
    }
  }

  return stats;
}

async function cleanupAllData(authToken) {
  console.log('🧹 开始清理所有测试数据和日志...\n');

  try {
    // 1. 清理日志文件
    console.log('1. 清理日志文件...');
    const fs = require('fs');
    const path = require('path');
    const logDir = path.join(__dirname, 'logs');

    if (fs.existsSync(logDir)) {
      const files = fs.readdirSync(logDir);
      files.forEach(file => {
        try {
          fs.unlinkSync(path.join(logDir, file));
          console.log(`   ✅ 删除日志文件: ${file}`);
        } catch (error) {
          console.log(`   ⚠️ 删除日志文件失败: ${file}`);
        }
      });
    }

    // 2. 重置所有用户流量
    console.log('\n2. 重置所有用户流量...');
    const usersResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
      'Authorization': authToken
    });

    if (usersResponse.statusCode === 200) {
      for (const user of usersResponse.data) {
        try {
          const resetResponse = await makeHttpRequest('POST', `http://localhost:3000/api/users/${user.id}/reset-traffic`, {
            reason: '超级极限测试自动清零'
          }, {
            'Authorization': authToken
          });

          if (resetResponse.statusCode === 200) {
            console.log(`   ✅ 用户 ${user.username} 流量重置成功`);
          } else {
            console.log(`   ⚠️ 用户 ${user.username} 流量重置失败:`, resetResponse.data);
          }
        } catch (error) {
          console.log(`   ❌ 重置用户 ${user.username} 流量失败:`, error.message);
        }
      }
    }

    // 3. 清理观察器累积统计
    console.log('\n3. 清理观察器累积统计...');
    try {
      const clearResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/clear-stats', {}, {
        'Authorization': authToken
      });

      if (clearResponse.statusCode === 200) {
        console.log('   ✅ 观察器累积统计清理成功');
      } else {
        console.log('   ⚠️ 观察器累积统计清理失败:', clearResponse.data);
      }
    } catch (error) {
      console.log('   ❌ 观察器累积统计清理失败:', error.message);
    }

    // 4. 强制同步缓存
    console.log('\n4. 强制同步缓存...');
    try {
      const syncResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/force-sync', {}, {
        'Authorization': authToken
      });

      if (syncResponse.statusCode === 200) {
        console.log('   ✅ 缓存同步成功');
      } else {
        console.log('   ⚠️ 缓存同步失败:', syncResponse.data);
      }
    } catch (error) {
      console.log('   ❌ 缓存同步失败:', error.message);
    }

    // 5. 等待处理完成
    console.log('\n5. 等待处理完成...');
    await sleep(5000);

    // 6. 验证清零结果
    console.log('\n6. 验证清零结果...');
    const finalResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
      'Authorization': authToken
    });

    if (finalResponse.statusCode === 200) {
      console.log('📊 清零后用户流量状态:');
      let totalTraffic = 0;
      for (const user of finalResponse.data) {
        const traffic = user.usedTraffic || 0;
        totalTraffic += traffic;
        console.log(`   ${user.username}: ${formatBytes(traffic)}`);
      }
      console.log(`📊 总流量: ${formatBytes(totalTraffic)}`);

      if (totalTraffic === 0) {
        console.log('\n🎉 所有数据清零成功！测试环境已准备就绪');
        return true;
      } else {
        console.log('\n⚠️ 仍有残留流量数据，但继续测试');
        return true;
      }
    }

  } catch (error) {
    console.error('❌ 清理过程中发生错误:', error);
    return false;
  }
}

async function testSuperExtreme() {
  console.log('🔥 开始超级极限压力测试...');
  console.log('⏱️ 测试时长: 3.5分钟');
  console.log('🎯 目标流量: 1.5TB+');
  console.log('🔌 测试端口: 6443(admin), 2999(test), 8080(admin)');
  console.log('💥 压力级别: 超级极限模式');
  console.log('🧹 自动清零: 所有历史数据和日志\n');

  let authToken;
  try {
    console.log('🔐 获取管理员 token...');
    authToken = await getAuthToken();
    console.log('✅ 登录成功\n');
  } catch (error) {
    console.error('❌ 获取 token 失败:', error.message);
    return;
  }

  // 🔧 关键修复：自动清零所有数据
  const cleanupSuccess = await cleanupAllData(authToken);
  if (!cleanupSuccess) {
    console.error('❌ 数据清理失败，终止测试');
    return;
  }

  try {
    // 🔧 移除重复的用户流量重置（已在 cleanupAllData 中完成）
    console.log('🔄 等待清理完成...');
    await sleep(3000);

    // 获取初始流量状态
    console.log('\n📊 初始流量状态:');
    const initialResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
      'Authorization': authToken
    });
    
    if (initialResponse.statusCode === 200) {
      for (const user of initialResponse.data) {
        console.log(`  ${user.username}: ${formatBytes(user.usedTraffic || 0)}`);
      }
    }

    // 启动超级极限测试
    const testDuration = 3.5 * 60 * 1000; // 3.5分钟
    const startTime = Date.now();

    console.log('\n🔥 启动超级极限并发测试...');
    
    const portTests = [
      superExtremePortTest(authToken, 6443, 1, 'admin', testDuration),
      superExtremePortTest(authToken, 2999, 2, 'test', testDuration),
      superExtremePortTest(authToken, 8080, 1, 'admin', testDuration)
    ];

    // 定期报告
    const reportInterval = setInterval(async () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, (testDuration - (Date.now() - startTime)) / 1000);
      
      console.log(`\n🔥 超级极限报告 (${Math.floor(elapsed/60)}:${String(Math.floor(elapsed%60)).padStart(2,'0')} / 3:30, 剩余 ${Math.floor(remaining/60)}:${String(Math.floor(remaining%60)).padStart(2,'0')}):`);
      
      try {
        const currentResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
          'Authorization': authToken
        });
        
        if (currentResponse.statusCode === 200) {
          let totalTraffic = 0;
          for (const user of currentResponse.data) {
            const traffic = user.usedTraffic || 0;
            totalTraffic += traffic;
            console.log(`  📊 ${user.username}: ${formatBytes(traffic)}`);
          }
          console.log(`  📊 总流量: ${formatBytes(totalTraffic)}`);
          
          if (totalTraffic > 1.5 * 1024 * 1024 * 1024 * 1024) { // 1.5TB
            console.log('🎉 已达到1.5TB目标！');
          }
        }
      } catch (error) {
        console.log('⚠️ 获取流量状态失败:', error.message);
      }
    }, 30000); // 每30秒报告一次

    // 等待所有测试完成
    const results = await Promise.allSettled(portTests);
    clearInterval(reportInterval);

    // 最终统计
    console.log('\n🔥 超级极限测试完成！\n');
    
    let totalRequests = 0;
    let totalErrors = 0;
    let totalTimeouts = 0;
    let totalSimulated = 0;

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const stats = result.value;
        totalRequests += stats.changes;
        totalErrors += stats.errors;
        totalTimeouts += stats.timeouts;
        totalSimulated += stats.totalSimulated;
        
        console.log(`📊 端口 ${stats.port} (${stats.username}):`);
        console.log(`   变化次数: ${stats.changes}`);
        console.log(`   模拟流量: ${formatBytes(stats.totalSimulated)}`);
        console.log(`   错误次数: ${stats.errors}`);
        console.log(`   超时次数: ${stats.timeouts}`);
        console.log(`   成功率: ${((stats.changes / (stats.changes + stats.errors + stats.timeouts)) * 100).toFixed(2)}%\n`);
      }
    });

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

    // 最终报告
    console.log('\n📈 超级极限测试最终报告:');
    console.log('='.repeat(80));
    console.log(`📡 总请求数: ${totalRequests.toLocaleString()}`);
    console.log(`✅ 成功率: ${((totalRequests / (totalRequests + totalErrors + totalTimeouts)) * 100).toFixed(2)}%`);
    console.log(`❌ 错误次数: ${totalErrors}`);
    console.log(`⏰ 超时次数: ${totalTimeouts}`);
    console.log(`📊 模拟总流量: ${formatBytes(totalSimulated)}`);
    console.log(`📊 用户总流量: ${formatBytes(finalTotalTraffic)}`);
    console.log(`📊 流量差异: ${formatBytes(Math.abs(totalSimulated - finalTotalTraffic))}`);
    console.log(`🎯 1.5TB目标: ${finalTotalTraffic >= 1.5 * 1024 * 1024 * 1024 * 1024 ? '✅ 达成' : '❌ 未达成'}`);
    console.log(`🔧 数据一致性: ${Math.abs(totalSimulated - finalTotalTraffic) < totalSimulated * 0.05 ? '✅ 优秀' : '⚠️ 需优化'}`);
    
    const testResult = finalTotalTraffic >= 1.5 * 1024 * 1024 * 1024 * 1024 && 
                      Math.abs(totalSimulated - finalTotalTraffic) < totalSimulated * 0.05 &&
                      ((totalRequests / (totalRequests + totalErrors + totalTimeouts)) * 100) >= 95;
    
    console.log(`\n🏆 超级极限测试评价: ${testResult ? '🎉 完美通过！' : '⚠️ 需要优化'}`);
    
    if (testResult) {
      console.log('\n🎊 恭喜！您的系统通过了超级极限压力测试！');
      console.log('✅ 处理了1.5TB+的流量数据');
      console.log('✅ 保持了高成功率和数据一致性');
      console.log('✅ 系统具备企业级的稳定性和性能');
    }

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  }
}

// 运行超级极限测试
testSuperExtreme();
