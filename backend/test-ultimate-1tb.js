/**
 * 1TB终极压力测试 - 极限流量统计验证
 * 测试时长：3分30秒
 * 目标流量：1TB
 * 每用户连接数：300个
 * 模拟场景：超高清流媒体、大文件传输、多媒体内容分发
 */

const http = require('http');

function makeHttpRequest(method, url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? require('https') : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout: 15000
    };

    const req = client.request(options, (res) => {
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
  
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 🚀 1TB级别流量模式定义
const ULTIMATE_PATTERNS = {
  // 8K视频流 (100-150 Mbps)
  video_8k: { 
    name: '8K视频流', 
    bytesPerSecond: 18 * 1024 * 1024,  // 18MB/s
    variance: 0.2,
    weight: 15 
  },
  // 4K视频流 (25-50 Mbps)
  video_4k: { 
    name: '4K视频流', 
    bytesPerSecond: 6 * 1024 * 1024,   // 6MB/s
    variance: 0.25,
    weight: 25 
  },
  // 大文件传输 (50-200 Mbps)
  large_file: { 
    name: '大文件传输', 
    bytesPerSecond: 12 * 1024 * 1024,  // 12MB/s
    variance: 0.3,
    weight: 20 
  },
  // 多媒体内容分发 (20-80 Mbps)
  media_cdn: { 
    name: '多媒体CDN', 
    bytesPerSecond: 8 * 1024 * 1024,   // 8MB/s
    variance: 0.4,
    weight: 25 
  },
  // 高清直播流 (10-30 Mbps)
  live_stream: { 
    name: '高清直播', 
    bytesPerSecond: 3 * 1024 * 1024,   // 3MB/s
    variance: 0.35,
    weight: 15 
  }
};

// 🚀 超高性能连接模拟
class UltimateConnection {
  constructor(port, userId, username, connectionId) {
    this.port = port;
    this.userId = userId;
    this.username = username;
    this.connectionId = connectionId;
    this.isActive = false;
    this.totalBytes = 0;
    this.pattern = this.selectUltimatePattern();
    this.startTime = Date.now();
    this.lastReportTime = Date.now();
    this.burstMode = false; // 突发模式
  }

  selectUltimatePattern() {
    const patterns = Object.values(ULTIMATE_PATTERNS);
    const totalWeight = patterns.reduce((sum, p) => sum + p.weight, 0);
    let randomWeight = Math.random() * totalWeight;
    
    for (const pattern of patterns) {
      randomWeight -= pattern.weight;
      if (randomWeight <= 0) {
        return pattern;
      }
    }
    return patterns[0];
  }

  // 🚀 生成1TB级别的流量数据
  generateUltimateTraffic(durationMs) {
    const durationSeconds = durationMs / 1000;
    let baseBytes = this.pattern.bytesPerSecond * durationSeconds;
    
    // 🔥 突发模式：随机进入高流量突发
    if (Math.random() < 0.1) { // 10%概率进入突发模式
      this.burstMode = !this.burstMode;
    }
    
    if (this.burstMode) {
      baseBytes *= 2.5; // 突发时流量增加2.5倍
    }
    
    // 添加网络波动
    const variance = 1 + (Math.random() - 0.5) * 2 * this.pattern.variance;
    const actualBytes = Math.floor(baseBytes * variance);
    
    this.totalBytes += actualBytes;
    return actualBytes;
  }

  // 📊 生成观察器数据
  createObserverData(incrementBytes) {
    return {
      events: [
        {
          kind: "service",
          service: `forward-tcp-${this.port}`,
          type: "stats",
          stats: {
            totalConns: this.connectionId,
            currentConns: Math.floor(Math.random() * 100) + 50, // 50-150个当前连接
            inputBytes: Math.floor(incrementBytes * 0.05),  // 上行5%
            outputBytes: Math.floor(incrementBytes * 0.95), // 下行95%（大文件下载特征）
            totalErrs: 0
          }
        }
      ]
    };
  }
}

// 🚀 1TB级别用户会话模拟
async function simulateUltimateUserSession(port, userId, username, testDuration, maxConnections, targetThroughput) {
  const stats = {
    port,
    userId,
    username,
    totalConnections: 0,
    activeConnections: 0,
    totalSimulated: 0,
    successfulReports: 0,
    failedReports: 0,
    startTime: Date.now(),
    targetThroughput // MB/s
  };

  console.log(`🚀 启动用户 ${username} 的1TB级别会话 (端口${port}, 目标${targetThroughput}MB/s)`);

  const connections = [];
  const endTime = Date.now() + testDuration;
  let connectionCounter = 0;

  // 🚀 超高性能连接管理循环
  while (Date.now() < endTime) {
    try {
      const currentTime = Date.now();
      const remainingTime = endTime - currentTime;
      
      // 🔗 激进的连接管理策略
      const currentThroughput = stats.totalSimulated / ((currentTime - stats.startTime) / 1000) / 1024 / 1024;
      const needMoreConnections = currentThroughput < stats.targetThroughput * 0.8;
      
      if (connections.length < maxConnections && (needMoreConnections || Math.random() < 0.4)) {
        // 40%概率或需要更多吞吐量时建立新连接
        const newConnection = new UltimateConnection(port, userId, username, ++connectionCounter);
        newConnection.isActive = true;
        connections.push(newConnection);
        stats.totalConnections++;
        stats.activeConnections++;
      }

      // 🚀 处理活跃连接的超高流量传输
      const activeConnections = connections.filter(conn => conn.isActive);
      
      for (const connection of activeConnections) {
        // 📊 高频数据传输（每300ms报告一次）
        const reportInterval = 300;
        const timeSinceLastReport = currentTime - connection.lastReportTime;
        
        if (timeSinceLastReport >= reportInterval) {
          const incrementBytes = connection.generateUltimateTraffic(timeSinceLastReport);
          stats.totalSimulated += incrementBytes;
          
          // 📡 发送观察器数据
          try {
            const observerData = connection.createObserverData(incrementBytes);
            const response = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', observerData);
            
            if (response.statusCode === 200) {
              stats.successfulReports++;
            } else {
              stats.failedReports++;
            }
          } catch (error) {
            stats.failedReports++;
          }
          
          connection.lastReportTime = currentTime;
        }

        // 🔚 动态连接管理
        if (Math.random() < 0.015) { // 1.5%概率关闭连接
          connection.isActive = false;
          stats.activeConnections--;
        }
      }

      // 📊 高频进度报告
      if (stats.successfulReports % 200 === 0 && stats.successfulReports > 0) {
        const elapsed = (currentTime - stats.startTime) / 1000;
        const throughput = stats.totalSimulated / elapsed / 1024 / 1024; // MB/s
        const progress = (elapsed / (testDuration / 1000) * 100).toFixed(1);
        
        console.log(`🚀 ${username}: ${elapsed.toFixed(0)}s (${progress}%), ${stats.activeConnections}连接, ${formatBytes(stats.totalSimulated)}, ${throughput.toFixed(2)}MB/s`);
      }

      // 🕐 高频循环
      await sleep(25); // 25ms循环间隔

    } catch (error) {
      stats.failedReports++;
      await sleep(50);
    }
  }

  // 🔚 关闭所有连接
  connections.forEach(conn => conn.isActive = false);
  stats.activeConnections = 0;

  return stats;
}

async function ultimate1TBTest() {
  console.log('🚀 开始1TB终极压力测试...\n');
  console.log('📊 测试参数:');
  console.log('   测试时长: 3分30秒 (210秒)');
  console.log('   目标流量: 1TB');
  console.log('   目标吞吐量: ~5GB/s');
  console.log('   每用户最大连接数: 300');
  console.log('   流量模式: 8K视频 + 4K视频 + 大文件传输 + CDN + 直播');
  console.log('   网络特征: 95%下行流量，5%上行流量');
  console.log('   特殊功能: 突发模式，动态连接管理\n');
  
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
    // 1. 重置所有用户流量
    console.log('1. 重置所有用户流量...');
    
    const resetUsers = [
      { id: 1, name: 'admin' },
      { id: 2, name: 'test' }
    ];

    for (const user of resetUsers) {
      const resetResponse = await makeHttpRequest('POST', `http://localhost:3000/api/users/${user.id}/reset-traffic`, {
        reason: '1TB终极压力测试'
      }, {
        'Authorization': authToken
      });
      
      if (resetResponse.statusCode === 200) {
        console.log(`✅ 用户 ${user.name} 流量重置成功`);
      } else {
        console.log(`⚠️ 用户 ${user.name} 流量重置失败:`, resetResponse.data);
      }
    }

    // 2. 清理观察器累积统计
    console.log('\n2. 清理观察器累积统计...');
    const clearResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/clear-stats', {}, {
      'Authorization': authToken
    });
    
    if (clearResponse.statusCode === 200) {
      console.log('✅ 观察器累积统计清理成功');
    } else {
      console.log('⚠️ 观察器累积统计清理失败:', clearResponse.data);
    }

    // 3. 等待处理完成
    await sleep(3000);

    // 4. 获取初始流量
    console.log('\n3. 获取初始流量状态...');
    const initialResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
      'Authorization': authToken
    });
    
    if (initialResponse.statusCode === 200) {
      for (const user of initialResponse.data) {
        console.log(`  ${user.username}: ${formatBytes(user.usedTraffic || 0)}`);
      }
    }

    // 5. 启动1TB终极压力测试
    console.log('\n4. 启动1TB终极压力测试...\n');
    
    const testDuration = 3.5 * 60 * 1000; // 3分30秒
    const maxConnections = 300;
    const targetTotalThroughput = 5 * 1024; // 5GB/s = 5120MB/s
    const startTime = Date.now();
    
    // 🚀 分配目标吞吐量给各端口
    const portTargets = [
      { port: 6443, userId: 1, username: 'admin', target: targetTotalThroughput * 0.4 }, // 40%
      { port: 2999, userId: 2, username: 'test', target: targetTotalThroughput * 0.3 },  // 30%
      { port: 8080, userId: 1, username: 'admin', target: targetTotalThroughput * 0.3 }  // 30%
    ];
    
    // 🚀 并发启动超高性能会话
    const ultimateSessions = portTargets.map(config => 
      simulateUltimateUserSession(config.port, config.userId, config.username, testDuration, maxConnections, config.target)
    );

    // 📊 定期总体报告
    const reportInterval = setInterval(async () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, (testDuration - (Date.now() - startTime)) / 1000);
      const progress = (elapsed / (testDuration / 1000) * 100).toFixed(1);
      
      console.log(`\n🚀 1TB终极测试报告 (${Math.floor(elapsed/60)}:${String(Math.floor(elapsed%60)).padStart(2,'0')} / 3:30, 剩余 ${Math.floor(remaining/60)}:${String(Math.floor(remaining%60)).padStart(2,'0')}, 进度 ${progress}%):`);
      
      try {
        const currentResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
          'Authorization': authToken
        });
        
        if (currentResponse.statusCode === 200) {
          let totalTraffic = 0;
          for (const user of currentResponse.data) {
            const traffic = user.usedTraffic || 0;
            totalTraffic += traffic;
            const throughput = traffic / elapsed / 1024 / 1024; // MB/s
            console.log(`  🚀 ${user.username}: ${formatBytes(traffic)} (${throughput.toFixed(2)}MB/s)`);
          }
          const totalThroughput = totalTraffic / elapsed / 1024 / 1024;
          const tbProgress = (totalTraffic / (1024 * 1024 * 1024 * 1024) * 100).toFixed(2);
          console.log(`  🚀 总流量: ${formatBytes(totalTraffic)} (${totalThroughput.toFixed(2)}MB/s, 1TB进度: ${tbProgress}%)`);
        }
      } catch (error) {
        console.log('⚠️ 获取流量状态失败:', error.message);
      }
    }, 20000); // 每20秒报告一次

    // 等待所有会话完成
    const results = await Promise.allSettled(ultimateSessions);
    clearInterval(reportInterval);

    // 最终统计
    console.log('\n🚀 1TB终极压力测试完成！\n');
    
    let totalConnections = 0;
    let totalReports = 0;
    let totalSimulated = 0;
    let totalErrors = 0;

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const stats = result.value;
        totalConnections += stats.totalConnections;
        totalReports += stats.successfulReports;
        totalSimulated += stats.totalSimulated;
        totalErrors += stats.failedReports;
        
        const duration = (Date.now() - stats.startTime) / 1000;
        const avgThroughput = stats.totalSimulated / duration / 1024 / 1024;
        
        console.log(`📊 端口 ${stats.port} (${stats.username}):`);
        console.log(`   总连接数: ${stats.totalConnections}`);
        console.log(`   成功报告: ${stats.successfulReports.toLocaleString()}`);
        console.log(`   模拟流量: ${formatBytes(stats.totalSimulated)}`);
        console.log(`   平均吞吐: ${avgThroughput.toFixed(2)}MB/s`);
        console.log(`   错误次数: ${stats.failedReports}\n`);
      }
    });

    // 等待处理完成
    await sleep(10000);

    // 获取最终用户流量
    console.log('📈 最终流量统计:');
    const finalResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
      'Authorization': authToken
    });
    
    let finalTotalTraffic = 0;
    if (finalResponse.statusCode === 200) {
      for (const user of finalResponse.data) {
        const traffic = user.usedTraffic || 0;
        finalTotalTraffic += traffic;
        console.log(`  ${user.username}: ${formatBytes(traffic)}`);
      }
    }

    // 最终分析
    const testDurationSeconds = testDuration / 1000;
    const targetBytes = 1024 * 1024 * 1024 * 1024; // 1TB
    const achievedPercentage = (finalTotalTraffic / targetBytes * 100).toFixed(2);
    
    console.log('\n📈 1TB终极压力测试分析:');
    console.log('='.repeat(100));
    console.log(`🚀 测试时长: ${testDurationSeconds}秒`);
    console.log(`🔗 总连接数: ${totalConnections.toLocaleString()}`);
    console.log(`📡 总报告数: ${totalReports.toLocaleString()}`);
    console.log(`✅ 成功率: ${((totalReports / (totalReports + totalErrors)) * 100).toFixed(2)}%`);
    console.log(`❌ 错误次数: ${totalErrors}`);
    console.log(`📊 模拟总流量: ${formatBytes(totalSimulated)}`);
    console.log(`📊 用户总流量: ${formatBytes(finalTotalTraffic)}`);
    console.log(`📊 流量差异: ${formatBytes(Math.abs(totalSimulated - finalTotalTraffic))}`);
    console.log(`📊 平均吞吐量: ${(finalTotalTraffic / testDurationSeconds / 1024 / 1024).toFixed(2)}MB/s`);
    console.log(`🎯 1TB目标达成: ${achievedPercentage}%`);
    
    const ratio = totalSimulated > 0 ? (finalTotalTraffic / totalSimulated).toFixed(4) : 0;
    console.log(`📊 放大倍数: ${ratio}x`);
    
    const isAccurate = Math.abs(totalSimulated - finalTotalTraffic) < totalSimulated * 0.02; // 2%容差
    console.log(`🔧 数据一致性: ${isAccurate ? '✅ 优秀' : '⚠️ 需优化'}`);
    
    if (isAccurate) {
      console.log('\n🎉 1TB终极压力测试通过！系统在极限负载下表现卓越！');
      console.log('✅ 流量统计精确，完全适合企业级生产环境部署');
      console.log('🚀 您的GOST管理系统已达到工业级标准！');
    } else {
      console.log('\n⚠️ 1TB终极压力测试发现优化空间');
      console.log('🔍 在极限负载下可能需要进一步调优');
    }

    console.log('\n🚀 1TB终极压力测试完成');

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  }
}

ultimate1TBTest();
