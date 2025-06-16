/**
 * 修复配额设置脚本
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

async function fixQuotaSettings() {
  console.log('🔧 开始修复配额设置...\n');
  
  let authToken;
  try {
    authToken = await getAuthToken();
    console.log('✅ 登录成功\n');
  } catch (error) {
    console.error('❌ 登录失败:', error.message);
    return;
  }

  try {
    // 1. 直接修改数据库
    console.log('1. 直接修改数据库配额设置...');
    const { User } = require('./models');
    
    const user = await User.findByPk(2);
    if (user) {
      await user.update({
        trafficQuota: 0.1, // 0.1GB = 100MB
        usedTraffic: 0     // 重置流量
      });
      console.log('✅ 数据库配额已设置为0.1GB (100MB)');
    }

    // 2. 验证设置
    console.log('\n2. 验证配额设置...');
    const updatedUser = await User.findByPk(2);
    console.log(`📊 配额: ${updatedUser.trafficQuota}GB`);
    console.log(`📊 已用流量: ${updatedUser.usedTraffic} bytes`);

    // 3. 清除所有缓存
    console.log('\n3. 清除所有缓存...');
    const quotaManagementService = require('./services/quotaManagementService');
    const gostLimiterService = require('./services/gostLimiterService');
    
    quotaManagementService.clearAllQuotaCache();
    gostLimiterService.clearAllQuotaCache();
    console.log('✅ 缓存已清除');

    // 4. 验证修复结果
    console.log('\n4. 验证修复结果...');
    const quotaStatus = await quotaManagementService.checkUserQuotaStatus(2);
    console.log('📊 配额状态:');
    console.log(`   配额: ${quotaStatus.quotaBytes ? (quotaStatus.quotaBytes / (1024*1024*1024)).toFixed(1) : '未知'}GB`);
    console.log(`   已用: ${quotaStatus.usedTraffic || 0} bytes`);
    console.log(`   使用率: ${quotaStatus.usagePercentage}%`);
    console.log(`   状态: ${quotaStatus.status}`);

    console.log('\n✅ 配额设置修复完成！');
    console.log('\n📋 现在可以重新运行演示测试:');
    console.log('   node demo-traffic-interruption.js');

  } catch (error) {
    console.error('❌ 修复过程中发生错误:', error);
  } finally {
    process.exit(0);
  }
}

fixQuotaSettings();
