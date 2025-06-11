/**
 * 观察器处理管道调试脚本
 * 逐步检查观察器数据处理的每个环节
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

async function debugObserverPipeline() {
  console.log('🔍 观察器处理管道调试...\n');

  try {
    // === 阶段1：检查数据库状态 ===
    console.log('='.repeat(60));
    console.log('📊 阶段1：检查数据库状态');
    console.log('='.repeat(60));

    const { User, UserForwardRule } = require('./models');
    
    // 检查用户数据
    const users = await User.findAll({
      attributes: ['id', 'username', 'trafficQuota', 'usedTraffic', 'isActive']
    });

    console.log('👥 用户数据:');
    users.forEach(user => {
      console.log(`  ${user.username} (ID:${user.id}): ${formatBytes(user.usedTraffic || 0)} / ${user.trafficQuota || 'unlimited'}GB, 活跃:${user.isActive}`);
    });

    // 检查转发规则
    const rules = await UserForwardRule.findAll({
      where: { isActive: true },
      attributes: ['id', 'name', 'sourcePort', 'userId', 'usedTraffic']
    });

    console.log('\n📋 活跃转发规则:');
    rules.forEach(rule => {
      console.log(`  规则${rule.id}: 端口${rule.sourcePort} -> 用户${rule.userId}, 流量:${formatBytes(rule.usedTraffic || 0)}`);
    });

    // === 阶段2：检查端口映射缓存 ===
    console.log('\n' + '='.repeat(60));
    console.log('🗺️ 阶段2：检查端口映射缓存');
    console.log('='.repeat(60));

    const multiInstanceCacheService = require('./services/multiInstanceCacheService');
    
    // 强制刷新端口映射
    console.log('🔄 强制刷新端口映射...');
    await multiInstanceCacheService.refreshPortUserMapping();
    
    const portMapping = await multiInstanceCacheService.getPortUserMapping();
    console.log('📊 端口映射状态:');
    if (Object.keys(portMapping).length === 0) {
      console.log('❌ 端口映射为空 - 这是关键问题！');
      
      // 尝试手动同步缓存
      console.log('🔧 尝试手动同步缓存...');
      await multiInstanceCacheService.syncCache();
      
      const retryMapping = await multiInstanceCacheService.getPortUserMapping();
      console.log('🔄 重试后的端口映射:');
      if (Object.keys(retryMapping).length === 0) {
        console.log('❌ 重试后仍然为空');
      } else {
        Object.entries(retryMapping).forEach(([port, userInfo]) => {
          console.log(`  ✅ 端口${port}: 用户${userInfo.userId} (${userInfo.username})`);
        });
      }
    } else {
      Object.entries(portMapping).forEach(([port, userInfo]) => {
        console.log(`  ✅ 端口${port}: 用户${userInfo.userId} (${userInfo.username})`);
      });
    }

    // === 阶段3：测试观察器数据处理 ===
    console.log('\n' + '='.repeat(60));
    console.log('🔍 阶段3：测试观察器数据处理');
    console.log('='.repeat(60));

    // 记录初始流量
    const initialUsers = await User.findAll({
      attributes: ['id', 'username', 'usedTraffic']
    });

    console.log('📊 发送前用户流量:');
    initialUsers.forEach(user => {
      console.log(`  ${user.username}: ${formatBytes(user.usedTraffic || 0)}`);
    });

    // 发送测试数据到每个端口
    const testPorts = [6443, 8080, 2999];
    const testSize = 10 * 1024 * 1024; // 10MB

    for (const port of testPorts) {
      console.log(`\n📤 测试端口${port}...`);
      
      const testData = {
        events: [{
          kind: "service",
          service: `forward-tcp-${port}`,
          type: "stats",
          stats: {
            totalConns: 1,
            currentConns: 1,
            inputBytes: testSize / 2,
            outputBytes: testSize / 2,
            totalErrs: 0
          }
        }]
      };

      console.log(`  发送数据: ${formatBytes(testSize)}`);
      
      const response = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', testData);
      
      if (response.statusCode === 200) {
        console.log(`  ✅ 观察器响应成功:`, response.data);
      } else {
        console.log(`  ❌ 观察器响应失败: ${response.statusCode}`, response.data);
      }

      // 等待处理
      await sleep(3000);

      // 检查结果
      const updatedUsers = await User.findAll({
        attributes: ['id', 'username', 'usedTraffic']
      });

      console.log(`  📊 处理后用户流量:`);
      updatedUsers.forEach(user => {
        const initialUser = initialUsers.find(u => u.id === user.id);
        const initialTraffic = initialUser ? initialUser.usedTraffic || 0 : 0;
        const currentTraffic = user.usedTraffic || 0;
        const change = currentTraffic - initialTraffic;
        
        if (change > 0) {
          console.log(`    ${user.username}: ${formatBytes(currentTraffic)} (+${formatBytes(change)}) ✅`);
        } else {
          console.log(`    ${user.username}: ${formatBytes(currentTraffic)} (无变化) ❌`);
        }
      });
    }

    // === 阶段4：检查观察器内部状态 ===
    console.log('\n' + '='.repeat(60));
    console.log('🔧 阶段4：检查观察器内部状态');
    console.log('='.repeat(60));

    const gostPluginService = require('./services/gostPluginService');
    
    // 检查累积统计
    const cumulativeStats = gostPluginService.getCumulativeStatsInfo();
    console.log('📊 观察器累积统计:');
    console.log(`  跟踪条目数: ${cumulativeStats.totalTracked}`);
    
    if (cumulativeStats.entries.length > 0) {
      console.log('  所有记录:');
      cumulativeStats.entries.forEach(entry => {
        console.log(`    ${entry.key}: ${formatBytes(entry.totalBytes)} (${entry.lastUpdate})`);
      });
    } else {
      console.log('  ❌ 没有累积统计记录');
    }

    // 检查缓冲区状态
    const bufferStatus = gostPluginService.getBufferStatus();
    console.log('\n📊 观察器缓冲区状态:');
    console.log(`  流量缓冲区: ${bufferStatus.trafficBufferSize} 条`);
    console.log(`  网速缓冲区: ${bufferStatus.speedBufferSize} 条`);

    // === 阶段5：诊断结论 ===
    console.log('\n' + '='.repeat(60));
    console.log('🎯 阶段5：诊断结论');
    console.log('='.repeat(60));

    const finalUsers = await User.findAll({
      attributes: ['id', 'username', 'usedTraffic']
    });

    let hasAnyUpdate = false;
    finalUsers.forEach(user => {
      const initialUser = initialUsers.find(u => u.id === user.id);
      const change = (user.usedTraffic || 0) - (initialUser.usedTraffic || 0);
      if (change > 0) {
        hasAnyUpdate = true;
      }
    });

    if (hasAnyUpdate) {
      console.log('✅ 观察器处理管道部分正常');
      console.log('🔧 建议检查1TB测试中的具体数据格式');
    } else {
      console.log('❌ 观察器处理管道完全失效');
      console.log('🔧 问题可能在于:');
      
      if (Object.keys(portMapping).length === 0) {
        console.log('   1. 端口映射缓存同步失败');
      }
      
      if (cumulativeStats.totalTracked === 0) {
        console.log('   2. 观察器数据没有被接收');
      }
      
      console.log('   3. 数据库更新逻辑有问题');
      console.log('   4. 多实例缓存服务的updateUserTraffic方法失效');
    }

  } catch (error) {
    console.error('❌ 调试过程中发生错误:', error);
  } finally {
    process.exit(0);
  }
}

debugObserverPipeline();
