/**
 * 简单的观察器调试 - 用小数据量快速定位问题
 */

const http = require('http');

function makeHttpRequest(method, url, data) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: url,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
        } catch (error) {
          resolve({ statusCode: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

function formatBytes(bytes) {
  if (!bytes) return '0B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)}${units[unitIndex]}`;
}

async function debugSimple() {
  console.log('🔍 简单观察器调试 - 1MB数据测试\n');

  try {
    // 1. 检查初始状态
    console.log('1. 检查初始状态...');
    const { User } = require('./models');
    
    const beforeUsers = await User.findAll({ attributes: ['id', 'username', 'usedTraffic'] });
    console.log('📊 初始流量:');
    beforeUsers.forEach(user => {
      console.log(`  ${user.username}: ${formatBytes(user.usedTraffic || 0)}`);
    });

    // 2. 检查端口映射
    console.log('\n2. 检查端口映射...');
    const multiInstanceCacheService = require('./services/multiInstanceCacheService');
    const portMapping = await multiInstanceCacheService.getPortUserMapping();
    
    console.log('📊 端口映射:');
    if (Object.keys(portMapping).length === 0) {
      console.log('❌ 端口映射为空！');
      
      // 尝试刷新
      console.log('🔄 尝试刷新端口映射...');
      await multiInstanceCacheService.refreshPortUserMapping();
      const newMapping = await multiInstanceCacheService.getPortUserMapping();
      
      if (Object.keys(newMapping).length === 0) {
        console.log('❌ 刷新后仍为空，这是主要问题！');
        return;
      } else {
        console.log('✅ 刷新后有映射:');
        Object.entries(newMapping).forEach(([port, info]) => {
          console.log(`  端口${port}: 用户${info.userId} (${info.username})`);
        });
      }
    } else {
      Object.entries(portMapping).forEach(([port, info]) => {
        console.log(`  端口${port}: 用户${info.userId} (${info.username})`);
      });
    }

    // 3. 发送1MB测试数据
    console.log('\n3. 发送1MB测试数据到端口2999...');
    
    const testData = {
      events: [{
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
      }]
    };

    console.log('📤 发送观察器数据...');
    const response = await makeHttpRequest('POST', '/api/gost-plugin/observer', testData);
    
    if (response.statusCode === 200) {
      console.log('✅ 观察器响应成功:', response.data);
    } else {
      console.log('❌ 观察器响应失败:', response.statusCode, response.data);
    }

    // 4. 等待处理并检查结果
    console.log('\n4. 等待3秒后检查结果...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    const afterUsers = await User.findAll({ attributes: ['id', 'username', 'usedTraffic'] });
    console.log('📊 处理后流量:');
    
    let hasUpdate = false;
    afterUsers.forEach(user => {
      const before = beforeUsers.find(u => u.id === user.id);
      const beforeTraffic = before ? before.usedTraffic || 0 : 0;
      const afterTraffic = user.usedTraffic || 0;
      const change = afterTraffic - beforeTraffic;
      
      if (change > 0) {
        console.log(`  ${user.username}: ${formatBytes(afterTraffic)} (+${formatBytes(change)}) ✅`);
        hasUpdate = true;
      } else {
        console.log(`  ${user.username}: ${formatBytes(afterTraffic)} (无变化) ❌`);
      }
    });

    // 5. 诊断结果
    console.log('\n5. 诊断结果:');
    if (hasUpdate) {
      console.log('✅ 观察器工作正常！');
      console.log('🔧 1TB测试问题可能在于数据格式或频率');
    } else {
      console.log('❌ 观察器不工作！');
      
      // 检查观察器内部状态
      const gostPluginService = require('./services/gostPluginService');
      const stats = gostPluginService.getCumulativeStatsInfo();
      console.log(`📊 观察器跟踪条目: ${stats.totalTracked}`);
      
      if (stats.totalTracked === 0) {
        console.log('🔧 问题: 观察器没有接收到数据');
      } else {
        console.log('🔧 问题: 观察器接收了数据但没有更新数据库');
      }
    }

  } catch (error) {
    console.error('❌ 调试失败:', error);
  } finally {
    process.exit(0);
  }
}

debugSimple();
