/**
 * 100MB配额限制演示
 * 确保配额设置正确并演示中断效果
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

async function demo100MBLimit() {
  console.clear();
  console.log('🎬 100MB配额限制演示');
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
    // 1. 确保配额设置正确
    console.log('🔧 确保配额设置正确...');
    
    // 直接修改数据库确保配额正确
    const { User } = require('./models');
    const user = await User.findByPk(2);
    if (user) {
      await user.update({
        trafficQuota: 0.1, // 0.1GB = 100MB
        usedTraffic: 0     // 重置流量
      });
      console.log('✅ 配额已设置为100MB，流量已重置');
    }

    // 清除缓存
    const quotaManagementService = require('./services/quotaManagementService');
    const gostLimiterService = require('./services/gostLimiterService');
    quotaManagementService.clearAllQuotaCache();
    gostLimiterService.clearAllQuotaCache();

    await sleep(2000);

    // 2. 验证初始状态
    console.log('\n📊 验证初始状态...');
    const initialStatus = await quotaManagementService.checkUserQuotaStatus(2);
    console.log(`   配额: ${formatBytes(initialStatus.quotaBytes || 0)}`);
    console.log(`   已用: ${formatBytes(initialStatus.usedTraffic || 0)}`);
    console.log(`   使用率: ${initialStatus.usagePercentage}%`);
    console.log(`   状态: ${initialStatus.status}`);

    if (initialStatus.quotaBytes !== 107374182.4) { // 100MB in bytes
      console.log('❌ 配额设置不正确，请检查');
      return;
    }

    console.log('✅ 初始状态正确\n');

    // 3. 开始演示传输
    console.log('🚀 开始流量传输演示...\n');
    
    const chunkSize = 20; // 每次传输20MB
    let transmitted = 0;
    let interrupted = false;

    while (transmitted < 200 && !interrupted) {
      // 发送数据
      console.log(`📤 传输数据块 ${transmitted}MB → ${transmitted + chunkSize}MB...`);
      
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

      // 清除缓存确保获取最新状态
      quotaManagementService.clearAllQuotaCache();
      gostLimiterService.clearAllQuotaCache();
      
      await sleep(1000);

      // 检查状态
      const currentStatus = await quotaManagementService.checkUserQuotaStatus(2);
      const usagePercentage = parseFloat(currentStatus.usagePercentage);
      const usedMB = (currentStatus.usedTraffic || 0) / (1024 * 1024);
      
      // 清屏并显示实时状态
      console.clear();
      console.log('🎬 100MB配额限制演示 - 实时监控');
      console.log('='.repeat(60));
      
      // 显示进度条
      console.log('📊 传输进度:');
      console.log(`   目标: 200MB | 配额限制: 100MB`);
      console.log(`   已传输: ${usedMB.toFixed(1)}MB`);
      console.log(`   ${createProgressBar(Math.min(usagePercentage, 100))}`);
      console.log('');
      
      // 显示配额状态
      console.log('📈 配额状态:');
      console.log(`   使用率: ${currentStatus.usagePercentage}%`);
      console.log(`   状态: ${currentStatus.status}`);
      console.log(`   告警级别: ${currentStatus.alertLevel}`);
      console.log(`   允许访问: ${currentStatus.allowed ? '✅ 是' : '🚫 否'}`);
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
      const limiterRequest = {
        scope: 'client',
        service: 'forward-tcp-2999',
        network: 'tcp',
        addr: 'test.com:443',
        client: 'user_2',
        src: '127.0.0.1:12345'
      };
      
      const limiterResponse = await gostLimiterService.handleLimiterRequest(limiterRequest);
      const isBlocked = limiterResponse.in === 0 && limiterResponse.out === 0;
      
      console.log('🔒 限制器状态:');
      if (isBlocked) {
        console.log('   🚫 转发已被阻止 (in=0, out=0)');
      } else {
        console.log('   ✅ 转发正常 (in=-1, out=-1)');
      }

      if (interrupted) {
        console.log('\n' + '='.repeat(60));
        console.log('🛑 传输中断详情:');
        console.log(`   中断时间: ${new Date().toLocaleString()}`);
        console.log(`   已传输: ${formatBytes(currentStatus.usedTraffic || 0)}`);
        console.log(`   配额限制: ${formatBytes(currentStatus.quotaBytes || 0)}`);
        console.log(`   使用率: ${currentStatus.usagePercentage}%`);
        console.log(`   中断原因: ${currentStatus.reason}`);
        console.log('='.repeat(60));
        
        // 验证后续传输被阻止
        console.log('\n🔍 验证后续传输确实被阻止...');
        
        for (let i = 0; i < 3; i++) {
          console.log(`\n📤 尝试第${i + 1}次额外传输...`);
          
          await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', transferData);
          await sleep(1000);
          
          quotaManagementService.clearAllQuotaCache();
          const retryStatus = await quotaManagementService.checkUserQuotaStatus(2);
          const retryUsedMB = (retryStatus.usedTraffic || 0) / (1024 * 1024);
          
          console.log(`   结果: ${retryUsedMB.toFixed(1)}MB (${retryStatus.allowed ? '允许' : '被阻止'})`);
          
          if (!retryStatus.allowed) {
            console.log('   ✅ 确认：后续传输被正确阻止');
          }
        }
        
        break;
      }

      console.log(`\n⏳ 继续传输中... (按Ctrl+C可停止)`);
      await sleep(3000);
    }

    if (!interrupted) {
      console.log('\n⚠️ 意外：传输完成但未被中断');
    }

    console.log('\n🎉 演示完成！');

  } catch (error) {
    console.error('❌ 演示过程中发生错误:', error);
  } finally {
    process.exit(0);
  }
}

demo100MBLimit();
