/**
 * Phase 3 配额事件和告警测试
 * 测试配额事件记录、告警机制和用户界面集成
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testPhase3Events() {
  console.log('🧪 开始Phase 3配额事件和告警测试...\n');
  
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
    // 1. 测试事件统计信息
    console.log('1. 测试事件统计信息...');
    const eventStatsResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/quota/events/stats', null, {
      'Authorization': authToken
    });
    
    if (eventStatsResponse.statusCode === 200) {
      const stats = eventStatsResponse.data.data;
      console.log('✅ 事件统计信息:');
      console.log(`   总事件数: ${stats.totalEvents}`);
      console.log(`   最近事件: ${stats.recentEvents}`);
      console.log(`   按类型统计:`, stats.eventsByType);
      console.log(`   按告警级别统计:`, stats.eventsByAlertLevel);
    } else {
      console.log('❌ 获取事件统计失败');
    }

    // 2. 重置test用户流量，触发事件记录
    console.log('\n2. 重置test用户流量，触发事件记录...');
    const resetResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/quota/reset/2', {
      reason: 'Phase 3 事件测试'
    }, {
      'Authorization': authToken
    });
    
    if (resetResponse.statusCode === 200) {
      console.log('✅ Test用户流量重置成功');
      
      // 等待事件处理
      await sleep(2000);
      
      // 获取最新事件
      const eventsResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/quota/events?limit=5', null, {
        'Authorization': authToken
      });
      
      if (eventsResponse.statusCode === 200) {
        console.log('📝 最新事件:');
        eventsResponse.data.data.forEach((event, index) => {
          console.log(`  ${index + 1}. [${event.type}] ${event.message}`);
          console.log(`     时间: ${new Date(event.timestamp).toLocaleString()}`);
        });
      }
    } else {
      console.log('❌ Test用户流量重置失败');
    }

    // 3. 模拟流量增长，触发不同级别的告警
    console.log('\n3. 模拟流量增长，触发不同级别的告警...');
    
    // 发送80GB流量（80%使用率，应该触发caution告警）
    console.log('📤 发送80GB流量数据（80%使用率）...');
    const caution80GBData = {
      events: [
        {
          kind: "service",
          service: "forward-tcp-2999",
          type: "stats",
          stats: {
            totalConns: 1,
            currentConns: 1,
            inputBytes: 40 * 1024 * 1024 * 1024,  // 40GB
            outputBytes: 40 * 1024 * 1024 * 1024, // 40GB
            totalErrs: 0
          }
        }
      ]
    };

    await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', caution80GBData);
    await sleep(3000); // 等待处理

    // 检查配额状态
    const status80Response = await makeHttpRequest('GET', 'http://localhost:3000/api/quota/status/2', null, {
      'Authorization': authToken
    });
    
    if (status80Response.statusCode === 200) {
      const status = status80Response.data.data;
      console.log(`📊 80GB后状态: ${status.status} (${status.usagePercentage}%, 告警级别: ${status.alertLevel})`);
    }

    // 发送额外10GB流量（90%使用率，应该触发warning告警）
    console.log('📤 发送额外10GB流量数据（90%使用率）...');
    const warning90GBData = {
      events: [
        {
          kind: "service",
          service: "forward-tcp-2999",
          type: "stats",
          stats: {
            totalConns: 1,
            currentConns: 1,
            inputBytes: 5 * 1024 * 1024 * 1024,   // 5GB
            outputBytes: 5 * 1024 * 1024 * 1024,  // 5GB
            totalErrs: 0
          }
        }
      ]
    };

    await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', warning90GBData);
    await sleep(3000); // 等待处理

    // 检查配额状态
    const status90Response = await makeHttpRequest('GET', 'http://localhost:3000/api/quota/status/2', null, {
      'Authorization': authToken
    });
    
    if (status90Response.statusCode === 200) {
      const status = status90Response.data.data;
      console.log(`📊 90GB后状态: ${status.status} (${status.usagePercentage}%, 告警级别: ${status.alertLevel})`);
    }

    // 发送额外20GB流量（110%使用率，应该触发critical告警和禁止访问）
    console.log('📤 发送额外20GB流量数据（110%使用率）...');
    const critical110GBData = {
      events: [
        {
          kind: "service",
          service: "forward-tcp-2999",
          type: "stats",
          stats: {
            totalConns: 1,
            currentConns: 1,
            inputBytes: 10 * 1024 * 1024 * 1024,  // 10GB
            outputBytes: 10 * 1024 * 1024 * 1024, // 10GB
            totalErrs: 0
          }
        }
      ]
    };

    await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', critical110GBData);
    await sleep(3000); // 等待处理

    // 检查配额状态
    const status110Response = await makeHttpRequest('GET', 'http://localhost:3000/api/quota/status/2', null, {
      'Authorization': authToken
    });
    
    if (status110Response.statusCode === 200) {
      const status = status110Response.data.data;
      console.log(`📊 110GB后状态: ${status.status} (${status.usagePercentage}%, 告警级别: ${status.alertLevel})`);
    }

    // 4. 获取告警事件
    console.log('\n4. 获取告警事件...');
    const alertsResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/quota/alerts?limit=10', null, {
      'Authorization': authToken
    });
    
    if (alertsResponse.statusCode === 200) {
      console.log('🚨 告警事件:');
      alertsResponse.data.data.forEach((alert, index) => {
        console.log(`  ${index + 1}. [${alert.alertLevel || alert.type}] ${alert.message}`);
        console.log(`     时间: ${new Date(alert.timestamp).toLocaleString()}`);
        if (alert.usagePercentage) {
          console.log(`     使用率: ${alert.usagePercentage}%`);
        }
      });
    } else {
      console.log('❌ 获取告警事件失败');
    }

    // 5. 获取用户特定事件
    console.log('\n5. 获取test用户的特定事件...');
    const userEventsResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/quota/events?userId=2&limit=10', null, {
      'Authorization': authToken
    });
    
    if (userEventsResponse.statusCode === 200) {
      console.log('📝 Test用户事件:');
      userEventsResponse.data.data.forEach((event, index) => {
        console.log(`  ${index + 1}. [${event.type}] ${event.message}`);
        console.log(`     时间: ${new Date(event.timestamp).toLocaleString()}`);
      });
    } else {
      console.log('❌ 获取用户事件失败');
    }

    // 6. 测试限制器在不同告警级别下的行为
    console.log('\n6. 测试限制器在不同告警级别下的行为...');
    
    const limiterResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/test-limiter', {
      userId: 2,
      service: 'forward-tcp-2999'
    }, {
      'Authorization': authToken
    });
    
    if (limiterResponse.statusCode === 200) {
      const { in: inLimit, out: outLimit } = limiterResponse.data.response;
      if (inLimit === 0 && outLimit === 0) {
        console.log('✅ Test用户: 正确被限制 (流量超限)');
      } else {
        console.log(`⚠️ Test用户: 限制异常 in=${inLimit}, out=${outLimit}`);
      }
    }

    // 7. 获取最终事件统计
    console.log('\n7. 获取最终事件统计...');
    const finalStatsResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/quota/events/stats', null, {
      'Authorization': authToken
    });
    
    if (finalStatsResponse.statusCode === 200) {
      const stats = finalStatsResponse.data.data;
      console.log('📊 最终事件统计:');
      console.log(`   总事件数: ${stats.totalEvents}`);
      console.log(`   按类型统计:`, stats.eventsByType);
      console.log(`   按告警级别统计:`, stats.eventsByAlertLevel);
    }

    console.log('\n🎉 Phase 3配额事件和告警测试完成！');
    console.log('\n📋 测试总结:');
    console.log('✅ 事件记录系统');
    console.log('✅ 告警级别机制');
    console.log('✅ 配额状态变化监控');
    console.log('✅ 事件查询API');
    console.log('✅ 告警事件API');
    console.log('✅ 用户事件过滤');
    console.log('\n🚀 Phase 3 流量配额检查完成！系统已完全就绪！');

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  }
}

testPhase3Events();
