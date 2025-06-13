/**
 * 基础流量统计测试
 * 验证观察器是否能正确记录流量
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

async function testBasicTraffic() {
  console.log('🧪 基础流量统计测试...\n');

  try {
    // 1. 检查初始状态
    console.log('1. 检查初始状态...');
    const { User } = require('./models');
    
    const initialUsers = await User.findAll({
      attributes: ['id', 'username', 'usedTraffic']
    });

    console.log('📊 初始用户流量:');
    initialUsers.forEach(user => {
      console.log(`  ${user.username}: ${formatBytes(user.usedTraffic || 0)}`);
    });

    // 2. 发送多个端口的流量数据
    console.log('\n2. 发送多个端口的流量数据...');
    
    const testPorts = [6443, 8080, 2999]; // admin的两个端口 + test的端口
    const testData = [];

    for (const port of testPorts) {
      testData.push({
        kind: "service",
        service: `forward-tcp-${port}`,
        type: "stats",
        stats: {
          totalConns: 1,
          currentConns: 1,
          inputBytes: 5 * 1024 * 1024,   // 5MB
          outputBytes: 5 * 1024 * 1024,  // 5MB
          totalErrs: 0
        }
      });
    }

    const observerData = { events: testData };
    
    console.log('📤 发送观察器数据:');
    testData.forEach(event => {
      console.log(`  ${event.service}: ${formatBytes(event.stats.inputBytes + event.stats.outputBytes)}`);
    });

    const response = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', observerData);
    
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
    const finalUsers = await User.findAll({
      attributes: ['id', 'username', 'usedTraffic']
    });

    console.log('📊 处理后用户流量:');
    let hasUpdate = false;
    
    finalUsers.forEach(user => {
      const initialUser = initialUsers.find(u => u.id === user.id);
      const initialTraffic = initialUser ? initialUser.usedTraffic || 0 : 0;
      const currentTraffic = user.usedTraffic || 0;
      const change = currentTraffic - initialTraffic;
      
      console.log(`  ${user.username}: ${formatBytes(currentTraffic)} (变化: ${formatBytes(change)})`);
      
      if (change > 0) {
        hasUpdate = true;
        console.log(`    ✅ 流量已更新`);
      } else {
        console.log(`    ❌ 流量未更新`);
      }
    });

    // 5. 总结
    console.log('\n5. 测试总结...');
    if (hasUpdate) {
      console.log('✅ 基础流量统计功能正常');
      
      // 检查哪些端口有效
      console.log('\n📊 有效端口分析:');
      for (const port of testPorts) {
        const expectedUserId = port === 2999 ? 2 : 1; // 2999是test用户，其他是admin
        const user = finalUsers.find(u => u.id === expectedUserId);
        const initialUser = initialUsers.find(u => u.id === expectedUserId);
        
        const change = (user.usedTraffic || 0) - (initialUser.usedTraffic || 0);
        
        if (change > 0) {
          console.log(`  端口${port} -> 用户${expectedUserId}: ✅ 有效 (${formatBytes(change)})`);
        } else {
          console.log(`  端口${port} -> 用户${expectedUserId}: ❌ 无效`);
        }
      }
      
    } else {
      console.log('❌ 基础流量统计功能异常');
      console.log('🔧 可能的问题:');
      console.log('   - 端口映射缓存问题');
      console.log('   - 观察器处理逻辑问题');
      console.log('   - 数据库更新问题');
    }

    // 6. 检查端口映射状态
    console.log('\n6. 检查端口映射状态...');
    const multiInstanceCacheService = require('./services/multiInstanceCacheService');
    const portMapping = await multiInstanceCacheService.getPortUserMapping();
    
    console.log('📊 当前端口映射:');
    if (Object.keys(portMapping).length === 0) {
      console.log('   ❌ 端口映射为空');
    } else {
      Object.entries(portMapping).forEach(([port, userInfo]) => {
        console.log(`   端口${port}: 用户${userInfo.userId} (${userInfo.username})`);
      });
    }

  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    process.exit(0);
  }
}

testBasicTraffic();
