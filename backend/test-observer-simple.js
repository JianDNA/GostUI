/**
 * 简单观察器测试
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testObserverSimple() {
  console.log('🧪 简单观察器测试...\n');

  try {
    // 1. 检查初始状态
    console.log('1. 检查初始状态...');
    const { User } = require('./models');
    
    let user = await User.findByPk(2);
    console.log(`📊 初始状态: ${formatBytes(user.usedTraffic || 0)} / ${user.trafficQuota}GB`);

    // 2. 发送小量数据测试
    console.log('\n2. 发送1MB数据测试...');
    
    const testData = {
      events: [
        {
          kind: "service",
          service: "forward-tcp-2999",
          type: "stats",
          stats: {
            totalConns: 1,
            currentConns: 1,
            inputBytes: 512 * 1024,   // 512KB
            outputBytes: 512 * 1024,  // 512KB
            totalErrs: 0
          }
        }
      ]
    };

    console.log('📤 发送观察器数据:', JSON.stringify(testData, null, 2));
    
    const response = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', testData);
    
    if (response.statusCode === 200) {
      console.log('✅ 观察器响应成功:', response.data);
    } else {
      console.log('❌ 观察器响应失败:', response.statusCode, response.data);
    }

    // 3. 等待处理
    console.log('\n3. 等待处理...');
    await sleep(5000);

    // 4. 检查结果
    console.log('\n4. 检查处理结果...');
    user = await User.findByPk(2);
    console.log(`📊 处理后状态: ${formatBytes(user.usedTraffic || 0)} / ${user.trafficQuota}GB`);
    
    const expectedBytes = 1024 * 1024; // 1MB
    const actualBytes = user.usedTraffic || 0;
    
    if (actualBytes > 0) {
      console.log(`✅ 流量已更新: ${formatBytes(actualBytes)}`);
      if (Math.abs(actualBytes - expectedBytes) < 1024) {
        console.log('✅ 流量更新正确');
      } else {
        console.log(`⚠️ 流量更新有偏差: 预期${formatBytes(expectedBytes)}, 实际${formatBytes(actualBytes)}`);
      }
    } else {
      console.log('❌ 流量未更新');
    }

    // 5. 测试配额检查
    console.log('\n5. 测试配额检查...');
    const quotaManagementService = require('./services/quotaManagementService');
    quotaManagementService.clearAllQuotaCache();
    
    const quotaStatus = await quotaManagementService.checkUserQuotaStatus(2);
    console.log('📊 配额状态:');
    console.log(`   使用率: ${quotaStatus.usagePercentage}%`);
    console.log(`   状态: ${quotaStatus.status}`);
    console.log(`   允许访问: ${quotaStatus.allowed}`);

    // 6. 测试限制器
    console.log('\n6. 测试限制器...');
    const gostLimiterService = require('./services/gostLimiterService');
    gostLimiterService.clearAllQuotaCache();
    
    const limiterRequest = {
      scope: 'client',
      service: 'forward-tcp-2999',
      network: 'tcp',
      addr: 'test.com:443',
      client: 'user_2',
      src: '127.0.0.1:12345'
    };
    
    const limiterResponse = await gostLimiterService.handleLimiterRequest(limiterRequest);
    console.log('📊 限制器响应:');
    console.log(`   输入限制: ${limiterResponse.in}`);
    console.log(`   输出限制: ${limiterResponse.out}`);

    console.log('\n🎉 简单观察器测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    process.exit(0);
  }
}

testObserverSimple();
