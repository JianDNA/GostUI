/**
 * 测试多实例缓存方案
 * 验证：支持 PM2 多实例部署的缓存系统正常工作
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

async function testMemoryCache() {
  console.log('🧪 开始测试内存缓存替代方案...\n');
  
  let authToken;
  try {
    authToken = await getAuthToken();
    console.log('✅ 登录成功');
  } catch (error) {
    console.error('❌ 获取 token 失败:', error.message);
    return;
  }

  try {
    // 1. 重置 admin 用户流量
    console.log('\n🔄 1. 重置 admin 用户流量...');
    
    const resetResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/users/1/reset-traffic', {
      reason: '测试内存缓存替代方案'
    }, {
      'Authorization': authToken
    });
    
    if (resetResponse.statusCode === 200) {
      console.log('✅ admin 用户流量重置成功');
    } else {
      console.log('⚠️ admin 用户流量重置失败:', resetResponse.data);
    }

    await sleep(2000);

    // 2. 获取初始流量状态
    console.log('\n📊 2. 获取初始流量状态...');
    
    const initialResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
      'Authorization': authToken
    });
    
    if (initialResponse.statusCode !== 200) {
      console.log('❌ 获取用户列表失败:', initialResponse.data);
      return;
    }

    const adminUser = initialResponse.data.find(user => user.username === 'admin');
    if (!adminUser) {
      console.log('❌ 未找到 admin 用户');
      return;
    }

    const initialTraffic = adminUser.usedTraffic || 0;
    console.log(`✅ Admin 用户初始流量: ${formatBytes(initialTraffic)}`);

    // 3. 进行多次流量测试
    console.log('\n📤 3. 进行多次流量测试...');
    
    const testCases = [
      { name: '第1次', bytes: 25 * 1024 * 1024 }, // 25MB
      { name: '第2次', bytes: 35 * 1024 * 1024 }, // 35MB (增量10MB)
      { name: '第3次', bytes: 35 * 1024 * 1024 }, // 重复数据，应该无增量
      { name: '第4次', bytes: 60 * 1024 * 1024 }, // 60MB (增量25MB)
      { name: '第5次', bytes: 100 * 1024 * 1024 }, // 100MB (增量40MB)
    ];

    let expectedCumulativeBytes = 0;
    const results = [];
    
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      
      console.log(`\n📤 ${testCase.name}: 发送累积值 ${formatBytes(testCase.bytes)}`);
      
      const observerData = {
        events: [
          {
            kind: "service",
            service: "forward-tcp-6443",
            type: "stats",
            stats: {
              totalConns: i + 1,
              currentConns: 0,
              inputBytes: testCase.bytes / 2,
              outputBytes: testCase.bytes / 2,
              totalErrs: 0
            }
          }
        ]
      };

      const response = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', observerData);
      
      if (response.statusCode === 200) {
        console.log(`✅ ${testCase.name} 数据发送成功`);
      } else {
        console.log(`❌ ${testCase.name} 数据发送失败:`, response.data);
        continue;
      }

      await sleep(2000);

      // 检查流量变化
      const checkResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
        'Authorization': authToken
      });
      
      if (checkResponse.statusCode === 200) {
        const updatedAdminUser = checkResponse.data.find(user => user.username === 'admin');
        if (updatedAdminUser) {
          const currentTraffic = updatedAdminUser.usedTraffic || 0;
          const actualIncrease = currentTraffic - initialTraffic;
          
          // 计算预期累积值
          if (i === 0) {
            expectedCumulativeBytes = testCase.bytes; // 首次：25MB
          } else if (i === 1) {
            expectedCumulativeBytes = testCase.bytes; // 第2次：35MB总计
          } else if (i === 2) {
            // 第3次：重复数据，无增量，总计仍为35MB
          } else if (i === 3) {
            expectedCumulativeBytes = testCase.bytes; // 第4次：60MB总计
          } else if (i === 4) {
            expectedCumulativeBytes = testCase.bytes; // 第5次：100MB总计
          }
          
          const difference = Math.abs(actualIncrease - expectedCumulativeBytes);
          const isCorrect = difference < 1048576; // 允许1MB误差
          
          console.log(`📈 ${testCase.name} 后流量: ${formatBytes(currentTraffic)}`);
          console.log(`📊 实际增量: ${formatBytes(actualIncrease)}`);
          console.log(`📊 预期累积: ${formatBytes(expectedCumulativeBytes)}`);
          console.log(`📊 差异: ${formatBytes(difference)}`);
          console.log(`📝 结果: ${isCorrect ? '✅ 正确' : '❌ 异常'}`);
          
          results.push({
            test: testCase.name,
            expected: expectedCumulativeBytes,
            actual: actualIncrease,
            difference: difference,
            correct: isCorrect
          });
        }
      }
    }

    // 4. 测试缓存性能
    console.log('\n⚡ 4. 测试缓存性能...');
    
    const performanceTests = [];
    for (let i = 0; i < 10; i++) {
      const startTime = Date.now();
      
      const perfResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
        'Authorization': authToken
      });
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      if (perfResponse.statusCode === 200) {
        performanceTests.push(responseTime);
        console.log(`📊 第${i+1}次请求: ${responseTime}ms`);
      }
      
      await sleep(100);
    }
    
    const avgResponseTime = performanceTests.reduce((sum, time) => sum + time, 0) / performanceTests.length;
    console.log(`📊 平均响应时间: ${avgResponseTime.toFixed(2)}ms`);

    // 5. 最终验证和总结
    console.log('\n🔍 5. 最终验证和总结...');
    
    const finalResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
      'Authorization': authToken
    });
    
    if (finalResponse.statusCode === 200) {
      const finalAdminUser = finalResponse.data.find(user => user.username === 'admin');
      if (finalAdminUser) {
        const finalTraffic = finalAdminUser.usedTraffic || 0;
        const totalIncrease = finalTraffic - initialTraffic;
        
        console.log(`📈 最终流量: ${formatBytes(finalTraffic)}`);
        console.log(`📊 总增量: ${formatBytes(totalIncrease)}`);
        console.log(`📊 预期总增量: ${formatBytes(100 * 1024 * 1024)}`); // 100MB
        
        const finalDifference = Math.abs(totalIncrease - 100 * 1024 * 1024);
        const finalCorrect = finalDifference < 1048576; // 允许1MB误差
        
        console.log(`📊 最终差异: ${formatBytes(finalDifference)}`);
        console.log(`📝 最终结果: ${finalCorrect ? '✅ 内存缓存替代方案成功！' : '❌ 仍有问题'}`);
        
        // 统计测试结果
        const correctTests = results.filter(r => r.correct).length;
        const totalTests = results.length;
        
        console.log('\n📝 测试总结:');
        console.log('='.repeat(50));
        console.log(`📊 测试通过率: ${correctTests}/${totalTests} (${(correctTests/totalTests*100).toFixed(2)}%)`);
        console.log(`⚡ 平均响应时间: ${avgResponseTime.toFixed(2)}ms`);
        console.log(`💾 缓存类型: 内存缓存 (无 Redis 依赖)`);
        console.log(`🔧 增量计算: ${finalCorrect ? '✅ 正确' : '❌ 异常'}`);
        console.log(`🚀 系统性能: ${avgResponseTime < 100 ? '✅ 优秀' : avgResponseTime < 300 ? '⚠️ 良好' : '❌ 需优化'}`);
        
        if (finalCorrect && correctTests >= totalTests * 0.8 && avgResponseTime < 300) {
          console.log('\n🎉 内存缓存替代方案验证成功！');
          console.log('✅ 无需 Redis 依赖');
          console.log('✅ 流量计算准确');
          console.log('✅ 性能表现良好');
          console.log('✅ 部署简化');
        } else {
          console.log('\n⚠️ 内存缓存替代方案需要优化');
          console.log('建议检查：缓存逻辑、性能优化、错误处理');
        }
      }
    }

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  }
}

// 格式化字节数显示
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

// 延迟函数
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 运行测试
testMemoryCache();
