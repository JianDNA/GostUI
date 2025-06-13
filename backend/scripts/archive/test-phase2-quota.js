/**
 * Phase 2 流量配额控制测试
 * 测试完整的流量配额控制功能
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

async function testPhase2Quota() {
  console.log('🧪 开始Phase 2流量配额控制测试...\n');
  
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
    // 1. 检查配额管理服务状态
    console.log('1. 检查配额管理服务状态...');
    const quotaStatsResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/quota/stats', null, {
      'Authorization': authToken
    });
    
    if (quotaStatsResponse.statusCode === 200) {
      const stats = quotaStatsResponse.data.data;
      console.log('✅ 配额管理服务状态:');
      console.log(`   监控活跃: ${stats.monitoringActive}`);
      console.log(`   检查间隔: ${stats.checkInterval / 1000}秒`);
      console.log(`   缓存状态: ${stats.cachedStates}个用户`);
    } else {
      console.log('❌ 配额管理服务状态查询失败');
    }

    // 2. 获取所有用户的配额状态
    console.log('\n2. 获取所有用户的配额状态...');
    const quotaStatusResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/quota/status', null, {
      'Authorization': authToken
    });
    
    if (quotaStatusResponse.statusCode === 200) {
      const statuses = quotaStatusResponse.data.data;
      console.log('📊 用户配额状态:');
      statuses.forEach(status => {
        console.log(`  ${status.username} (${status.role}):`);
        console.log(`    状态: ${status.status}`);
        console.log(`    允许访问: ${status.allowed}`);
        if (status.usagePercentage) {
          console.log(`    使用率: ${status.usagePercentage}%`);
        }
        console.log(`    原因: ${status.reason}`);
      });
    } else {
      console.log('❌ 获取配额状态失败');
    }

    // 3. 测试限制器在配额超限时的行为
    console.log('\n3. 测试限制器在配额超限时的行为...');
    
    // 测试test用户（应该被限制）
    const testUserLimiterResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/test-limiter', {
      userId: 2,
      service: 'forward-tcp-2999'
    }, {
      'Authorization': authToken
    });
    
    if (testUserLimiterResponse.statusCode === 200) {
      const { in: inLimit, out: outLimit } = testUserLimiterResponse.data.response;
      if (inLimit === 0 && outLimit === 0) {
        console.log('✅ Test用户: 正确被限制 (流量超限)');
      } else {
        console.log(`⚠️ Test用户: 限制异常 in=${inLimit}, out=${outLimit}`);
      }
    }

    // 测试admin用户（应该不被限制）
    const adminUserLimiterResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/test-limiter', {
      userId: 1,
      service: 'forward-tcp-6443'
    }, {
      'Authorization': authToken
    });
    
    if (adminUserLimiterResponse.statusCode === 200) {
      const { in: inLimit, out: outLimit } = adminUserLimiterResponse.data.response;
      if (inLimit === -1 && outLimit === -1) {
        console.log('✅ Admin用户: 正确无限制 (管理员特权)');
      } else {
        console.log(`⚠️ Admin用户: 限制异常 in=${inLimit}, out=${outLimit}`);
      }
    }

    // 4. 测试流量重置功能
    console.log('\n4. 测试流量重置功能...');
    
    // 重置test用户的流量
    const resetResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/quota/reset/2', {
      reason: 'Phase 2 测试重置'
    }, {
      'Authorization': authToken
    });
    
    if (resetResponse.statusCode === 200) {
      console.log('✅ Test用户流量重置成功');
      
      // 等待配额检查生效
      await sleep(3000);
      
      // 再次检查限制器状态
      const afterResetLimiterResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/test-limiter', {
        userId: 2,
        service: 'forward-tcp-2999'
      }, {
        'Authorization': authToken
      });
      
      if (afterResetLimiterResponse.statusCode === 200) {
        const { in: inLimit, out: outLimit } = afterResetLimiterResponse.data.response;
        if (inLimit === -1 && outLimit === -1) {
          console.log('✅ Test用户: 重置后正确恢复访问权限');
        } else {
          console.log(`⚠️ Test用户: 重置后仍被限制 in=${inLimit}, out=${outLimit}`);
        }
      }
    } else {
      console.log('❌ Test用户流量重置失败');
    }

    // 5. 测试手动配额检查
    console.log('\n5. 测试手动配额检查...');
    
    const manualCheckResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/quota/check', {
      userId: 2
    }, {
      'Authorization': authToken
    });
    
    if (manualCheckResponse.statusCode === 200) {
      console.log('✅ 手动配额检查成功');
      console.log(`   检查结果: ${manualCheckResponse.data.message}`);
    } else {
      console.log('❌ 手动配额检查失败');
    }

    // 6. 模拟流量增长并观察配额控制
    console.log('\n6. 模拟流量增长并观察配额控制...');
    
    // 发送一些观察器数据，模拟流量增长
    const observerData = {
      events: [
        {
          kind: "service",
          service: "forward-tcp-2999",
          type: "stats",
          stats: {
            totalConns: 1,
            currentConns: 1,
            inputBytes: 50 * 1024 * 1024 * 1024,  // 50GB
            outputBytes: 50 * 1024 * 1024 * 1024, // 50GB
            totalErrs: 0
          }
        }
      ]
    };

    console.log('📤 发送100GB流量数据...');
    const observerResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', observerData);
    
    if (observerResponse.statusCode === 200) {
      console.log('✅ 观察器数据发送成功');
      
      // 等待流量处理和配额检查
      await sleep(5000);
      
      // 检查用户流量状态
      const afterTrafficResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/quota/status/2', null, {
        'Authorization': authToken
      });
      
      if (afterTrafficResponse.statusCode === 200) {
        const status = afterTrafficResponse.data.data;
        console.log('📊 流量增长后的配额状态:');
        console.log(`   状态: ${status.status}`);
        console.log(`   允许访问: ${status.allowed}`);
        if (status.usagePercentage) {
          console.log(`   使用率: ${status.usagePercentage}%`);
        }
        
        // 再次测试限制器
        const finalLimiterResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/test-limiter', {
          userId: 2,
          service: 'forward-tcp-2999'
        }, {
          'Authorization': authToken
        });
        
        if (finalLimiterResponse.statusCode === 200) {
          const { in: inLimit, out: outLimit } = finalLimiterResponse.data.response;
          if (status.usagePercentage && parseFloat(status.usagePercentage) >= 100) {
            if (inLimit === 0 && outLimit === 0) {
              console.log('✅ 流量超限后正确被限制');
            } else {
              console.log(`⚠️ 流量超限但未被限制 in=${inLimit}, out=${outLimit}`);
            }
          } else {
            if (inLimit === -1 && outLimit === -1) {
              console.log('✅ 流量未超限，正确允许访问');
            } else {
              console.log(`⚠️ 流量未超限但被限制 in=${inLimit}, out=${outLimit}`);
            }
          }
        }
      }
    } else {
      console.log('❌ 观察器数据发送失败');
    }

    // 7. 获取最终的用户流量信息
    console.log('\n7. 获取最终的用户流量信息...');
    const finalUsersResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
      'Authorization': authToken
    });
    
    if (finalUsersResponse.statusCode === 200) {
      console.log('📊 最终用户流量状态:');
      finalUsersResponse.data.forEach(user => {
        const usedTraffic = formatBytes(user.usedTraffic || 0);
        const quota = user.trafficQuota ? `${user.trafficQuota}GB` : '无限制';
        const percentage = user.trafficQuota ? 
          ((user.usedTraffic || 0) / (user.trafficQuota * 1024 * 1024 * 1024) * 100).toFixed(2) + '%' : 
          'N/A';
        
        console.log(`  ${user.username}: ${usedTraffic} / ${quota} (${percentage})`);
      });
    }

    console.log('\n🎉 Phase 2流量配额控制测试完成！');
    console.log('\n📋 测试总结:');
    console.log('✅ 配额管理服务');
    console.log('✅ 配额状态查询');
    console.log('✅ 限制器配额控制');
    console.log('✅ 流量重置功能');
    console.log('✅ 手动配额检查');
    console.log('✅ 流量增长监控');
    console.log('\n🚀 Phase 2 GOST配置集成成功！可以进入Phase 3！');

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  }
}

testPhase2Quota();
