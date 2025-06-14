/**
 * 流媒体压力测试 - 模拟真实用户观看流媒体的场景
 * 测试时长：2分30秒
 * 每用户连接数：300个
 * 模拟场景：视频流媒体、音频流、图片加载等
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
      timeout: 10000
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

// 🎬 流媒体流量模式定义
const STREAMING_PATTERNS = {
  // 4K视频流 (25-35 Mbps)
  video_4k: { 
    name: '4K视频流', 
    bytesPerSecond: 4 * 1024 * 1024,  // 4MB/s
    variance: 0.3,  // 30%变化
    weight: 10 
  },
  // 1080p视频流 (5-8 Mbps)
  video_1080p: { 
    name: '1080p视频流', 
    bytesPerSecond: 1 * 1024 * 1024,  // 1MB/s
    variance: 0.25,
    weight: 30 
  },
  // 720p视频流 (2-4 Mbps)
  video_720p: { 
    name: '720p视频流', 
    bytesPerSecond: 400 * 1024,  // 400KB/s
    variance: 0.2,
    weight: 35 
  },
  // 音频流 (128-320 kbps)
  audio_stream: { 
    name: '音频流', 
    bytesPerSecond: 32 * 1024,  // 32KB/s
    variance: 0.15,
    weight: 15 
  },
  // 图片/缩略图加载
  image_load: { 
    name: '图片加载', 
    bytesPerSecond: 100 * 1024,  // 100KB/s
    variance: 0.5,
    weight: 10 
  }
};

// 🎭 连接生命周期模拟
class StreamingConnection {
  constructor(port, userId, username, connectionId) {
    this.port = port;
    this.userId = userId;
    this.username = username;
    this.connectionId = connectionId;
    this.isActive = false;
    this.totalBytes = 0;
    this.pattern = this.selectStreamingPattern();
    this.startTime = Date.now();
    this.lastReportTime = Date.now();
  }

  selectStreamingPattern() {
    const patterns = Object.values(STREAMING_PATTERNS);
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

  // 🎬 模拟流媒体数据传输
  generateStreamingData(durationMs) {
    const durationSeconds = durationMs / 1000;
    const baseBytes = this.pattern.bytesPerSecond * durationSeconds;
    
    // 添加随机变化模拟网络波动
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
            currentConns: Math.floor(Math.random() * 50) + 10, // 10-60个当前连接
            inputBytes: Math.floor(incrementBytes * 0.1),  // 上行10%
            outputBytes: Math.floor(incrementBytes * 0.9), // 下行90%（流媒体特征）
            totalErrs: 0
          }
        }
      ]
    };
  }
}

// 🎬 用户流媒体会话模拟
async function simulateUserStreamingSession(port, userId, username, testDuration, maxConnections) {
  const stats = {
    port,
    userId,
    username,
    totalConnections: 0,
    activeConnections: 0,
    totalSimulated: 0,
    successfulReports: 0,
    failedReports: 0,
    startTime: Date.now()
  };

  console.log(`🎬 启动用户 ${username} 的流媒体会话 (端口${port}, 最大${maxConnections}连接)`);

  const connections = [];
  const endTime = Date.now() + testDuration;
  let connectionCounter = 0;

  // 🎭 连接管理循环
  while (Date.now() < endTime) {
    try {
      const currentTime = Date.now();
      const remainingTime = endTime - currentTime;
      
      // 🔗 动态连接管理
      if (connections.length < maxConnections && Math.random() < 0.3) {
        // 30%概率建立新连接
        const newConnection = new StreamingConnection(port, userId, username, ++connectionCounter);
        newConnection.isActive = true;
        connections.push(newConnection);
        stats.totalConnections++;
        stats.activeConnections++;
      }

      // 🎬 处理活跃连接的数据传输
      const activeConnections = connections.filter(conn => conn.isActive);
      
      for (const connection of activeConnections) {
        // 📊 生成流媒体数据（每500ms报告一次）
        const reportInterval = 500;
        const timeSinceLastReport = currentTime - connection.lastReportTime;
        
        if (timeSinceLastReport >= reportInterval) {
          const incrementBytes = connection.generateStreamingData(timeSinceLastReport);
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

        // 🔚 随机关闭连接（模拟用户行为）
        if (Math.random() < 0.02) { // 2%概率关闭连接
          connection.isActive = false;
          stats.activeConnections--;
        }
      }

      // 🧹 清理非活跃连接
      const activeCount = connections.filter(conn => conn.isActive).length;
      if (activeCount !== stats.activeConnections) {
        stats.activeConnections = activeCount;
      }

      // 📊 定期报告
      if (stats.successfulReports % 100 === 0 && stats.successfulReports > 0) {
        const elapsed = (currentTime - stats.startTime) / 1000;
        const avgConnections = stats.activeConnections;
        const throughput = stats.totalSimulated / elapsed / 1024 / 1024; // MB/s
        
        console.log(`📊 ${username}: ${elapsed.toFixed(0)}s, ${avgConnections}连接, ${formatBytes(stats.totalSimulated)}, ${throughput.toFixed(2)}MB/s`);
      }

      // 🕐 控制循环频率
      await sleep(50); // 50ms循环间隔

    } catch (error) {
      stats.failedReports++;
      await sleep(100);
    }
  }

  // 🔚 关闭所有连接
  connections.forEach(conn => conn.isActive = false);
  stats.activeConnections = 0;

  return stats;
}

async function streamingPressureTest() {
  console.log('🎬 开始流媒体压力测试...\n');
  console.log('📊 测试参数:');
  console.log('   测试时长: 2分30秒');
  console.log('   每用户最大连接数: 300');
  console.log('   流媒体模式: 4K/1080p/720p视频 + 音频 + 图片');
  console.log('   网络特征: 90%下行流量，10%上行流量');
  console.log('   连接行为: 动态建立和关闭连接\n');
  
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
        reason: '流媒体压力测试'
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

    // 5. 启动流媒体压力测试
    console.log('\n4. 启动流媒体压力测试...\n');
    
    const testDuration = 2.5 * 60 * 1000; // 2分30秒
    const maxConnections = 300; // 每用户最大300连接
    const startTime = Date.now();
    
    // 🎬 并发启动多用户流媒体会话
    const streamingSessions = [
      simulateUserStreamingSession(6443, 1, 'admin', testDuration, maxConnections),
      simulateUserStreamingSession(2999, 2, 'test', testDuration, maxConnections),
      simulateUserStreamingSession(8080, 1, 'admin', testDuration, maxConnections)
    ];

    // 📊 定期总体报告
    const reportInterval = setInterval(async () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, (testDuration - (Date.now() - startTime)) / 1000);
      
      console.log(`\n🎬 流媒体压力测试报告 (${Math.floor(elapsed/60)}:${String(Math.floor(elapsed%60)).padStart(2,'0')} / 2:30, 剩余 ${Math.floor(remaining/60)}:${String(Math.floor(remaining%60)).padStart(2,'0')}):`);
      
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
            console.log(`  📊 ${user.username}: ${formatBytes(traffic)} (${throughput.toFixed(2)}MB/s)`);
          }
          console.log(`  📊 总流量: ${formatBytes(totalTraffic)} (${(totalTraffic/elapsed/1024/1024).toFixed(2)}MB/s)`);
        }
      } catch (error) {
        console.log('⚠️ 获取流量状态失败:', error.message);
      }
    }, 30000); // 每30秒报告一次

    // 等待所有会话完成
    const results = await Promise.allSettled(streamingSessions);
    clearInterval(reportInterval);

    // 最终统计
    console.log('\n🎬 流媒体压力测试完成！\n');
    
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
        console.log(`   成功报告: ${stats.successfulReports}`);
        console.log(`   模拟流量: ${formatBytes(stats.totalSimulated)}`);
        console.log(`   平均吞吐: ${avgThroughput.toFixed(2)}MB/s`);
        console.log(`   错误次数: ${stats.failedReports}\n`);
      }
    });

    // 等待处理完成
    await sleep(5000);

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
    console.log('\n📈 流媒体压力测试分析:');
    console.log('='.repeat(80));
    console.log(`🎬 测试时长: ${testDurationSeconds}秒`);
    console.log(`🔗 总连接数: ${totalConnections.toLocaleString()}`);
    console.log(`📡 总报告数: ${totalReports.toLocaleString()}`);
    console.log(`✅ 成功率: ${((totalReports / (totalReports + totalErrors)) * 100).toFixed(2)}%`);
    console.log(`❌ 错误次数: ${totalErrors}`);
    console.log(`📊 模拟总流量: ${formatBytes(totalSimulated)}`);
    console.log(`📊 用户总流量: ${formatBytes(finalTotalTraffic)}`);
    console.log(`📊 流量差异: ${formatBytes(Math.abs(totalSimulated - finalTotalTraffic))}`);
    console.log(`📊 平均吞吐量: ${(totalSimulated / testDurationSeconds / 1024 / 1024).toFixed(2)}MB/s`);
    
    const ratio = totalSimulated > 0 ? (finalTotalTraffic / totalSimulated).toFixed(3) : 0;
    console.log(`📊 放大倍数: ${ratio}x`);
    
    const isAccurate = Math.abs(totalSimulated - finalTotalTraffic) < totalSimulated * 0.05;
    console.log(`🔧 数据一致性: ${isAccurate ? '✅ 优秀' : '⚠️ 需优化'}`);
    
    if (isAccurate) {
      console.log('\n🎉 流媒体压力测试通过！系统在高负载下表现优秀。');
      console.log('✅ 流量统计准确，适合生产环境部署');
    } else {
      console.log('\n⚠️ 流媒体压力测试发现问题！');
      console.log('🔍 在高负载流媒体场景下需要进一步优化');
    }

    console.log('\n🎬 流媒体压力测试完成');

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  }
}

streamingPressureTest();
