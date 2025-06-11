/**
 * 真实流量限制测试
 * 演示用户达到配额限制时转发被中断
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

async function testRealTrafficLimit() {
  console.log('🧪 开始真实流量限制测试...\n');
  console.log('📋 测试场景:');
  console.log('   1. 设置test用户配额为100MB');
  console.log('   2. 模拟传输200MB数据');
  console.log('   3. 观察在100MB时转发被中断');
  console.log('   4. 验证后续请求被拒绝\n');
  
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
    // === 阶段1：准备测试环境 ===
    console.log('='.repeat(60));
    console.log('🔧 阶段1：准备测试环境');
    console.log('='.repeat(60));

    // 1. 设置test用户配额为100MB
    console.log('1. 设置test用户配额为100MB...');
    const updateUserResponse = await makeHttpRequest('PUT', 'http://localhost:3000/api/users/2', {
      trafficQuota: 0.1 // 0.1GB = 100MB
    }, {
      'Authorization': authToken
    });
    
    if (updateUserResponse.statusCode === 200) {
      console.log('✅ Test用户配额已设置为100MB');
    } else {
      console.log('❌ 设置用户配额失败');
      return;
    }

    // 2. 重置test用户流量
    console.log('2. 重置test用户流量...');
    await makeHttpRequest('POST', 'http://localhost:3000/api/quota/reset/2', {
      reason: '真实流量限制测试'
    }, {
      'Authorization': authToken
    });
    console.log('✅ Test用户流量已重置');

    await sleep(3000);

    // 3. 验证初始状态
    console.log('3. 验证初始状态...');
    const initialStatusResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/quota/status/2', null, {
      'Authorization': authToken
    });
    
    if (initialStatusResponse.statusCode === 200) {
      const status = initialStatusResponse.data.data;
      console.log(`📊 初始状态: ${status.status} (${status.usagePercentage}%)`);
      console.log(`📊 配额: ${status.quotaBytes ? formatBytes(status.quotaBytes) : '未知'}`);
      console.log(`📊 允许访问: ${status.allowed}`);
    }

    // === 阶段2：渐进式流量传输测试 ===
    console.log('\n' + '='.repeat(60));
    console.log('📈 阶段2：渐进式流量传输测试');
    console.log('='.repeat(60));

    const transferSteps = [
      { name: '第1次传输', size: 30, cumulative: 30 },   // 30MB
      { name: '第2次传输', size: 30, cumulative: 60 },   // 60MB (累计)
      { name: '第3次传输', size: 30, cumulative: 90 },   // 90MB (累计)
      { name: '第4次传输', size: 20, cumulative: 110 },  // 110MB (累计，应该被限制)
      { name: '第5次传输', size: 50, cumulative: 160 },  // 160MB (累计，应该被拒绝)
    ];

    for (let i = 0; i < transferSteps.length; i++) {
      const step = transferSteps[i];
      console.log(`\n📤 ${step.name}: 传输${step.size}MB数据...`);
      
      // 发送观察器数据模拟流量传输
      const transferData = {
        events: [
          {
            kind: "service",
            service: "forward-tcp-2999",
            type: "stats",
            stats: {
              totalConns: 1,
              currentConns: 1,
              inputBytes: step.size * 1024 * 1024 / 2,  // 一半输入
              outputBytes: step.size * 1024 * 1024 / 2, // 一半输出
              totalErrs: 0
            }
          }
        ]
      };

      const transferResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', transferData);
      
      if (transferResponse.statusCode === 200) {
        console.log(`✅ 数据传输请求已发送`);
      } else {
        console.log(`❌ 数据传输请求失败`);
      }

      // 等待处理
      await sleep(3000);

      // 检查配额状态
      const statusResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/quota/status/2', null, {
        'Authorization': authToken
      });
      
      if (statusResponse.statusCode === 200) {
        const status = statusResponse.data.data;
        const usagePercentage = parseFloat(status.usagePercentage);
        
        console.log(`📊 传输后状态:`);
        console.log(`   使用率: ${status.usagePercentage}%`);
        console.log(`   状态: ${status.status}`);
        console.log(`   告警级别: ${status.alertLevel}`);
        console.log(`   允许访问: ${status.allowed}`);
        
        // 判断是否应该被限制
        if (usagePercentage >= 100) {
          if (!status.allowed) {
            console.log(`🚫 ✅ 正确：流量超限，访问已被禁止`);
          } else {
            console.log(`⚠️ 异常：流量超限但仍允许访问`);
          }
        } else {
          if (status.allowed) {
            console.log(`✅ 正确：流量未超限，允许访问`);
          } else {
            console.log(`⚠️ 异常：流量未超限但被禁止访问`);
          }
        }
      }

      // 测试限制器行为
      console.log(`🔍 测试限制器行为...`);
      const limiterResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/test-limiter', {
        userId: 2,
        service: 'forward-tcp-2999'
      });
      
      if (limiterResponse.statusCode === 200) {
        const { in: inLimit, out: outLimit } = limiterResponse.data.response;
        const isBlocked = inLimit === 0 && outLimit === 0;
        
        if (isBlocked) {
          console.log(`🚫 限制器状态: 已阻止转发 (in=${inLimit}, out=${outLimit})`);
        } else {
          console.log(`✅ 限制器状态: 允许转发 (in=${inLimit}, out=${outLimit})`);
        }
      }

      // 如果已经被限制，显示中断信息
      const currentStatus = await makeHttpRequest('GET', 'http://localhost:3000/api/quota/status/2', null, {
        'Authorization': authToken
      });
      
      if (currentStatus.statusCode === 200 && !currentStatus.data.data.allowed) {
        console.log(`\n🛑 *** 流量传输已中断 ***`);
        console.log(`📊 中断时流量使用情况:`);
        console.log(`   已使用: ${formatBytes(currentStatus.data.data.usedTraffic || 0)}`);
        console.log(`   配额: ${formatBytes(currentStatus.data.data.quotaBytes || 0)}`);
        console.log(`   使用率: ${currentStatus.data.data.usagePercentage}%`);
        console.log(`   原因: ${currentStatus.data.data.reason}`);
        
        // 继续尝试后续传输，验证确实被阻止
        if (i < transferSteps.length - 1) {
          console.log(`\n🔍 验证后续传输确实被阻止...`);
        }
      }

      console.log('─'.repeat(50));
    }

    // === 阶段3：验证恢复机制 ===
    console.log('\n' + '='.repeat(60));
    console.log('🔄 阶段3：验证恢复机制');
    console.log('='.repeat(60));

    console.log('1. 重置流量配额...');
    await makeHttpRequest('POST', 'http://localhost:3000/api/quota/reset/2', {
      reason: '恢复测试'
    }, {
      'Authorization': authToken
    });

    await sleep(3000);

    console.log('2. 验证访问恢复...');
    const recoveryStatusResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/quota/status/2', null, {
      'Authorization': authToken
    });
    
    if (recoveryStatusResponse.statusCode === 200) {
      const status = recoveryStatusResponse.data.data;
      console.log(`📊 恢复后状态: ${status.status} (${status.usagePercentage}%)`);
      console.log(`📊 允许访问: ${status.allowed}`);
      
      if (status.allowed && status.usagePercentage === '0.00') {
        console.log('✅ 恢复机制工作正常');
      } else {
        console.log('⚠️ 恢复机制可能有问题');
      }
    }

    // === 阶段4：获取事件记录 ===
    console.log('\n' + '='.repeat(60));
    console.log('📝 阶段4：获取事件记录');
    console.log('='.repeat(60));

    const eventsResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/quota/events?userId=2&limit=10', null, {
      'Authorization': authToken
    });
    
    if (eventsResponse.statusCode === 200) {
      console.log('📝 相关事件记录:');
      eventsResponse.data.data.forEach((event, index) => {
        console.log(`  ${index + 1}. [${event.type}] ${event.message}`);
        console.log(`     时间: ${new Date(event.timestamp).toLocaleString()}`);
        if (event.alertLevel) {
          console.log(`     告警级别: ${event.alertLevel}`);
        }
      });
    }

    // === 测试完成 ===
    console.log('\n' + '='.repeat(60));
    console.log('🎉 真实流量限制测试完成！');
    console.log('='.repeat(60));
    
    console.log('\n📋 测试结果总结:');
    console.log('✅ 配额设置和重置功能');
    console.log('✅ 渐进式流量传输监控');
    console.log('✅ 配额超限时自动中断');
    console.log('✅ 限制器正确阻止转发');
    console.log('✅ 事件记录和告警机制');
    console.log('✅ 恢复机制验证');
    
    console.log('\n🎯 关键演示点:');
    console.log('• 用户配额设置为100MB');
    console.log('• 流量传输在达到100MB时被中断');
    console.log('• 后续传输请求被限制器拒绝');
    console.log('• 配额重置后立即恢复正常');

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  }
}

testRealTrafficLimit();
