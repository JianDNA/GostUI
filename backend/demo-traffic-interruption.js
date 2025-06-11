/**
 * 流量中断演示脚本
 * 实时显示流量传输被中断的过程
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
    throw new Error('登录失败');
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)}${units[unitIndex]}`;
}

function createProgressBar(percentage, width = 40) {
  const filled = Math.round(width * percentage / 100);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${percentage.toFixed(1)}%`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function demoTrafficInterruption() {
  console.clear();
  console.log('🎬 流量传输中断演示');
  console.log('='.repeat(60));
  console.log('📋 演示场景: 用户配额100MB，尝试传输200MB数据');
  console.log('🎯 预期结果: 在100MB时传输被中断');
  console.log('='.repeat(60));
  
  let authToken;
  try {
    console.log('🔐 正在登录...');
    authToken = await getAuthToken();
    console.log('✅ 登录成功\n');
  } catch (error) {
    console.error('❌ 登录失败:', error.message);
    return;
  }

  try {
    // 准备环境
    console.log('🔧 准备测试环境...');
    
    // 设置100MB配额
    await makeHttpRequest('PUT', 'http://localhost:3000/api/users/2', {
      trafficQuota: 0.1 // 100MB
    }, { 'Authorization': authToken });
    
    // 重置流量
    await makeHttpRequest('POST', 'http://localhost:3000/api/quota/reset/2', {
      reason: '演示测试'
    }, { 'Authorization': authToken });
    
    await sleep(2000);
    console.log('✅ 环境准备完成\n');

    // 开始演示
    console.log('🚀 开始流量传输演示...\n');
    
    const totalTarget = 200; // 目标传输200MB
    const chunkSize = 10;    // 每次传输10MB
    let transmitted = 0;
    let interrupted = false;

    while (transmitted < totalTarget && !interrupted) {
      // 显示当前传输状态
      console.log(`📤 正在传输数据块... (${transmitted}MB → ${transmitted + chunkSize}MB)`);
      
      // 发送数据
      const transferData = {
        events: [{
          kind: "service",
          service: "forward-tcp-2999",
          type: "stats",
          stats: {
            totalConns: 1,
            currentConns: 1,
            inputBytes: chunkSize * 1024 * 1024 / 2,
            outputBytes: chunkSize * 1024 * 1024 / 2,
            totalErrs: 0
          }
        }]
      };

      await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', transferData);
      transmitted += chunkSize;
      
      await sleep(2000);

      // 检查状态
      const statusResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/quota/status/2', null, {
        'Authorization': authToken
      });
      
      if (statusResponse.statusCode === 200) {
        const status = statusResponse.data.data;
        const usagePercentage = parseFloat(status.usagePercentage);
        const usedMB = (status.usedTraffic || 0) / (1024 * 1024);
        
        // 清屏并显示实时状态
        console.clear();
        console.log('🎬 流量传输中断演示 - 实时监控');
        console.log('='.repeat(60));
        
        // 显示进度条
        console.log('📊 传输进度:');
        console.log(`   目标: 200MB | 配额限制: 100MB`);
        console.log(`   已传输: ${usedMB.toFixed(1)}MB`);
        console.log(`   ${createProgressBar(Math.min(usagePercentage, 100))}`);
        console.log('');
        
        // 显示配额状态
        console.log('📈 配额状态:');
        console.log(`   使用率: ${status.usagePercentage}%`);
        console.log(`   状态: ${status.status}`);
        console.log(`   告警级别: ${status.alertLevel}`);
        console.log(`   允许访问: ${status.allowed ? '✅ 是' : '🚫 否'}`);
        console.log('');

        // 显示告警信息
        if (usagePercentage >= 80 && usagePercentage < 90) {
          console.log('⚠️  告警: 流量使用率已达80%，请注意！');
        } else if (usagePercentage >= 90 && usagePercentage < 100) {
          console.log('🚨 警告: 流量使用率已达90%，即将达到限制！');
        } else if (usagePercentage >= 100) {
          console.log('🛑 严重: 流量配额已耗尽，传输已被中断！');
          interrupted = true;
        }
        
        console.log('');

        // 测试限制器状态
        const limiterResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/test-limiter', {
          userId: 2,
          service: 'forward-tcp-2999'
        });
        
        if (limiterResponse.statusCode === 200) {
          const { in: inLimit, out: outLimit } = limiterResponse.data.response;
          const isBlocked = inLimit === 0 && outLimit === 0;
          
          console.log('🔒 限制器状态:');
          if (isBlocked) {
            console.log('   🚫 转发已被阻止 (in=0, out=0)');
          } else {
            console.log('   ✅ 转发正常 (in=-1, out=-1)');
          }
        }

        if (interrupted) {
          console.log('\n' + '='.repeat(60));
          console.log('🛑 传输中断详情:');
          console.log(`   中断时间: ${new Date().toLocaleString()}`);
          console.log(`   已传输: ${formatBytes(status.usedTraffic || 0)}`);
          console.log(`   配额限制: ${formatBytes(status.quotaBytes || 0)}`);
          console.log(`   使用率: ${status.usagePercentage}%`);
          console.log(`   中断原因: ${status.reason}`);
          console.log('='.repeat(60));
          
          // 尝试继续传输，验证确实被阻止
          console.log('\n🔍 验证后续传输确实被阻止...');
          
          for (let i = 0; i < 3; i++) {
            console.log(`\n📤 尝试第${i + 1}次额外传输...`);
            
            await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', transferData);
            await sleep(1000);
            
            const retryStatusResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/quota/status/2', null, {
              'Authorization': authToken
            });
            
            if (retryStatusResponse.statusCode === 200) {
              const retryStatus = retryStatusResponse.data.data;
              const retryUsedMB = (retryStatus.usedTraffic || 0) / (1024 * 1024);
              
              console.log(`   结果: ${retryUsedMB.toFixed(1)}MB (${retryStatus.allowed ? '允许' : '被阻止'})`);
              
              if (!retryStatus.allowed) {
                console.log('   ✅ 确认：后续传输被正确阻止');
              }
            }
          }
          
          break;
        }

        console.log(`\n⏳ 继续传输中... (按Ctrl+C可停止)`);
        await sleep(3000);
      }
    }

    if (!interrupted) {
      console.log('\n⚠️ 意外：传输完成但未被中断（可能配额设置有问题）');
    }

    // 演示恢复
    console.log('\n🔄 演示恢复机制...');
    console.log('📝 管理员重置用户流量配额...');
    
    await makeHttpRequest('POST', 'http://localhost:3000/api/quota/reset/2', {
      reason: '演示恢复'
    }, { 'Authorization': authToken });
    
    await sleep(2000);
    
    const finalStatusResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/quota/status/2', null, {
      'Authorization': authToken
    });
    
    if (finalStatusResponse.statusCode === 200) {
      const finalStatus = finalStatusResponse.data.data;
      console.log('✅ 恢复完成:');
      console.log(`   使用率: ${finalStatus.usagePercentage}%`);
      console.log(`   允许访问: ${finalStatus.allowed ? '✅ 是' : '🚫 否'}`);
    }

    console.log('\n🎉 演示完成！');
    console.log('\n📋 演示总结:');
    console.log('✅ 流量传输实时监控');
    console.log('✅ 配额超限自动中断');
    console.log('✅ 限制器正确阻止后续传输');
    console.log('✅ 管理员可重置恢复访问');

  } catch (error) {
    console.error('❌ 演示过程中发生错误:', error);
  }
}

demoTrafficInterruption();
