/**
 * 真正的1TB长时间测试 - 验证1TB级别流量统计准确性
 * 测试时长：12分钟
 * 目标流量：1TB
 * 目标吞吐量：~1.5GB/s
 * 每用户连接数：300个
 * 模拟场景：企业级数据中心、CDN分发、大规模流媒体
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
  
  return `${size.toFixed(unitIndex === 0 ? 0 : 2)}${units[unitIndex]}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 🚀 企业级1TB流量模式定义
const ENTERPRISE_PATTERNS = {
  // 数据中心备份 (200-500 Mbps)
  datacenter_backup: { 
    name: '数据中心备份', 
    bytesPerSecond: 40 * 1024 * 1024,  // 40MB/s
    variance: 0.3,
    weight: 20 
  },
  // CDN内容分发 (100-300 Mbps)
  cdn_distribution: { 
    name: 'CDN内容分发', 
    bytesPerSecond: 25 * 1024 * 1024,  // 25MB/s
    variance: 0.4,
    weight: 25 
  },
  // 8K视频流 (100-200 Mbps)
  video_8k_stream: { 
    name: '8K视频流', 
    bytesPerSecond: 20 * 1024 * 1024,  // 20MB/s
    variance: 0.25,
    weight: 15 
  },
  // 大文件传输 (50-150 Mbps)
  large_file_transfer: { 
    name: '大文件传输', 
    bytesPerSecond: 15 * 1024 * 1024,  // 15MB/s
    variance: 0.35,
    weight: 20 
  },
  // 实时数据同步 (80-120 Mbps)
  realtime_sync: { 
    name: '实时数据同步', 
    bytesPerSecond: 12 * 1024 * 1024,  // 12MB/s
    variance: 0.2,
    weight: 20 
  }
};

// 🚀 企业级连接模拟
class EnterpriseConnection {
  constructor(port, userId, username, connectionId) {
    this.port = port;
    this.userId = userId;
    this.username = username;
    this.connectionId = connectionId;
    this.isActive = false;
    this.totalBytes = 0;
    this.pattern = this.selectEnterprisePattern();
    this.startTime = Date.now();
    this.lastReportTime = Date.now();
    this.sustainedMode = Math.random() < 0.7; // 70%概率进入持续模式
    this.peakMultiplier = 1.0;
  }

  selectEnterprisePattern() {
    const patterns = Object.values(ENTERPRISE_PATTERNS);
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

  // 🚀 生成企业级持续流量
  generateEnterpriseTraffic(durationMs) {
    const durationSeconds = durationMs / 1000;
    let baseBytes = this.pattern.bytesPerSecond * durationSeconds;
    
    // 🔥 企业级流量特征：更稳定，偶尔峰值
    if (this.sustainedMode) {
      // 持续模式：稳定的高流量
      const variance = 1 + (Math.random() - 0.5) * 2 * (this.pattern.variance * 0.5);
      baseBytes *= variance;
      
      // 偶尔的峰值流量
      if (Math.random() < 0.05) { // 5%概率峰值
        this.peakMultiplier = 1.5 + Math.random() * 1.0; // 1.5-2.5倍峰值
      } else if (this.peakMultiplier > 1.0) {
        this.peakMultiplier *= 0.95; // 峰值逐渐衰减
      }
      
      baseBytes *= this.peakMultiplier;
    } else {
      // 突发模式：间歇性高流量
      if (Math.random() < 0.3) { // 30%概率有流量
        const variance = 1 + (Math.random() - 0.5) * 2 * this.pattern.variance;
        baseBytes *= variance * 2; // 突发时流量翻倍
      } else {
        baseBytes *= 0.1; // 其他时间很少流量
      }
    }
    
    const actualBytes = Math.floor(baseBytes);
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
            currentConns: Math.floor(Math.random() * 150) + 50, // 50-200个当前连接
            inputBytes: Math.floor(incrementBytes * 0.03),  // 上行3%
            outputBytes: Math.floor(incrementBytes * 0.97), // 下行97%（企业下载特征）
            totalErrs: 0
          }
        }
      ]
    };
  }
}

// 🚀 企业级用户会话模拟
async function simulateEnterpriseUserSession(port, userId, username, testDuration, maxConnections, targetThroughput) {
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
    targetThroughput,
    lastProgressReport: Date.now()
  };

  console.log(`🚀 启动用户 ${username} 的企业级会话 (端口${port}, 目标${targetThroughput}MB/s, 时长${Math.floor(testDuration/60000)}分钟)`);

  const connections = [];
  const endTime = Date.now() + testDuration;
  let connectionCounter = 0;

  // 🚀 企业级连接管理循环
  while (Date.now() < endTime) {
    try {
      const currentTime = Date.now();
      const elapsed = (currentTime - stats.startTime) / 1000;
      
      // 🔗 智能连接管理
      const currentThroughput = elapsed > 0 ? stats.totalSimulated / elapsed / 1024 / 1024 : 0;
      const needMoreThroughput = currentThroughput < stats.targetThroughput * 0.85;
      
      // 根据需要动态调整连接数
      if (connections.length < maxConnections && (needMoreThroughput || Math.random() < 0.2)) {
        const newConnection = new EnterpriseConnection(port, userId, username, ++connectionCounter);
        newConnection.isActive = true;
        connections.push(newConnection);
        stats.totalConnections++;
        stats.activeConnections++;
      }

      // 🚀 处理活跃连接的企业级流量传输
      const activeConnections = connections.filter(conn => conn.isActive);
      
      for (const connection of activeConnections) {
        // 📊 企业级数据传输（每400ms报告一次）
        const reportInterval = 400;
        const timeSinceLastReport = currentTime - connection.lastReportTime;
        
        if (timeSinceLastReport >= reportInterval) {
          const incrementBytes = connection.generateEnterpriseTraffic(timeSinceLastReport);
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

        // 🔚 企业级连接生命周期管理
        const connectionAge = currentTime - connection.startTime;
        const shouldClose = Math.random() < 0.008 || connectionAge > 300000; // 0.8%概率或5分钟后关闭
        
        if (shouldClose) {
          connection.isActive = false;
          stats.activeConnections--;
        }
      }

      // 📊 定期进度报告
      if (currentTime - stats.lastProgressReport > 60000) { // 每分钟报告一次
        const progress = ((currentTime - stats.startTime) / testDuration * 100).toFixed(1);
        const throughput = currentThroughput.toFixed(2);
        console.log(`📊 ${username}: ${Math.floor(elapsed/60)}:${String(Math.floor(elapsed%60)).padStart(2,'0')}, ${progress}%, ${stats.activeConnections}连接, ${formatBytes(stats.totalSimulated)}, ${throughput}MB/s`);
        stats.lastProgressReport = currentTime;
      }

      // 🕐 企业级循环频率
      await sleep(30); // 30ms循环间隔

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

async function real1TBTest() {
  console.log('🚀 开始真正的1TB长时间测试...\n');
  console.log('📊 测试参数:');
  console.log('   测试时长: 12分钟 (720秒)');
  console.log('   目标流量: 1TB');
  console.log('   目标吞吐量: ~1.5GB/s');
  console.log('   每用户最大连接数: 300');
  console.log('   流量模式: 数据中心备份 + CDN分发 + 8K视频 + 大文件传输 + 实时同步');
  console.log('   网络特征: 97%下行流量，3%上行流量');
  console.log('   特殊功能: 持续模式，智能连接管理，峰值流量\n');
  
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
        reason: '真正的1TB长时间测试'
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

    // 5. 启动真正的1TB长时间测试
    console.log('\n4. 启动真正的1TB长时间测试...\n');
    
    const testDuration = 12 * 60 * 1000; // 12分钟
    const maxConnections = 300;
    const targetTotalThroughput = 1.5 * 1024; // 1.5GB/s = 1536MB/s
    const startTime = Date.now();
    
    // 🚀 分配目标吞吐量给各端口
    const portTargets = [
      { port: 6443, userId: 1, username: 'admin', target: targetTotalThroughput * 0.45 }, // 45%
      { port: 2999, userId: 2, username: 'test', target: targetTotalThroughput * 0.35 },  // 35%
      { port: 8080, userId: 1, username: 'admin', target: targetTotalThroughput * 0.20 }  // 20%
    ];
    
    // 🚀 并发启动企业级会话
    const enterpriseSessions = portTargets.map(config => 
      simulateEnterpriseUserSession(config.port, config.userId, config.username, testDuration, maxConnections, config.target)
    );

    // 📊 定期总体报告
    const reportInterval = setInterval(async () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, (testDuration - (Date.now() - startTime)) / 1000);
      const progress = (elapsed / (testDuration / 1000) * 100).toFixed(1);
      
      console.log(`\n🚀 1TB长时间测试报告 (${Math.floor(elapsed/60)}:${String(Math.floor(elapsed%60)).padStart(2,'0')} / 12:00, 剩余 ${Math.floor(remaining/60)}:${String(Math.floor(remaining%60)).padStart(2,'0')}, 进度 ${progress}%):`);
      
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
          
          // 预估完成时间
          if (totalThroughput > 0) {
            const remainingBytes = (1024 * 1024 * 1024 * 1024) - totalTraffic;
            const etaSeconds = remainingBytes / (totalThroughput * 1024 * 1024);
            console.log(`  ⏱️ 预计1TB完成时间: ${Math.floor(etaSeconds/60)}:${String(Math.floor(etaSeconds%60)).padStart(2,'0')}`);
          }
        }
      } catch (error) {
        console.log('⚠️ 获取流量状态失败:', error.message);
      }
    }, 30000); // 每30秒报告一次

    // 等待所有会话完成
    const results = await Promise.allSettled(enterpriseSessions);
    clearInterval(reportInterval);

    // 最终统计
    console.log('\n🚀 真正的1TB长时间测试完成！\n');
    
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
    console.log('⏳ 等待最终数据处理完成...');
    await sleep(15000);

    // 🔧 DEBUG: 检查端口映射状态
    console.log('\n🔍 [DEBUG] 检查端口映射状态...');
    const multiInstanceCacheService = require('./services/multiInstanceCacheService');
    const portMapping = await multiInstanceCacheService.getPortUserMapping();
    console.log('📊 端口映射状态:');
    if (Object.keys(portMapping).length === 0) {
      console.log('❌ 端口映射为空 - 这是问题所在！');
    } else {
      Object.entries(portMapping).forEach(([port, userInfo]) => {
        console.log(`  端口${port}: 用户${userInfo.userId} (${userInfo.username})`);
      });
    }

    // 🔧 DEBUG: 检查观察器累积统计
    console.log('\n🔍 [DEBUG] 检查观察器累积统计...');
    const gostPluginService = require('./services/gostPluginService');
    const cumulativeStats = gostPluginService.getCumulativeStatsInfo();
    console.log('📊 观察器累积统计:');
    console.log(`  跟踪条目数: ${cumulativeStats.totalTracked}`);
    if (cumulativeStats.entries.length > 0) {
      console.log('  最近5条记录:');
      cumulativeStats.entries.slice(-5).forEach(entry => {
        console.log(`    ${entry.key}: ${(entry.totalBytes / 1024 / 1024).toFixed(2)}MB (${entry.lastUpdate})`);
      });
    } else {
      console.log('  ❌ 没有累积统计记录');
    }

    // 获取最终用户流量
    console.log('📈 最终流量统计:');
    let finalTotalTraffic = 0;
    let finalQuerySuccess = false;
    
    try {
      const finalResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
        'Authorization': authToken
      });
      
      if (finalResponse.statusCode === 200) {
        finalQuerySuccess = true;
        for (const user of finalResponse.data) {
          const traffic = user.usedTraffic || 0;
          finalTotalTraffic += traffic;
          console.log(`  ${user.username}: ${formatBytes(traffic)}`);
        }
      } else {
        console.log('❌ 最终查询失败，使用诊断查询...');
      }
    } catch (error) {
      console.log('❌ 最终查询异常，使用诊断查询...', error.message);
    }
    
    // 如果最终查询失败，使用诊断查询
    if (!finalQuerySuccess) {
      try {
        const { User } = require('./models');
        const users = await User.findAll({
          attributes: ['username', 'usedTraffic']
        });
        
        console.log('📊 诊断查询结果:');
        finalTotalTraffic = 0;
        users.forEach(user => {
          const traffic = user.usedTraffic || 0;
          finalTotalTraffic += traffic;
          console.log(`  ${user.username}: ${formatBytes(traffic)}`);
        });
        finalQuerySuccess = true;
      } catch (dbError) {
        console.log('❌ 诊断查询也失败:', dbError.message);
      }
    }

    // 最终分析
    const testDurationSeconds = testDuration / 1000;
    const targetBytes = 1024 * 1024 * 1024 * 1024; // 1TB
    const achievedPercentage = (finalTotalTraffic / targetBytes * 100).toFixed(2);
    
    console.log('\n📈 真正的1TB长时间测试分析:');
    console.log('='.repeat(120));
    console.log(`🚀 测试时长: ${Math.floor(testDurationSeconds/60)}分${testDurationSeconds%60}秒`);
    console.log(`🔗 总连接数: ${totalConnections.toLocaleString()}`);
    console.log(`📡 总报告数: ${totalReports.toLocaleString()}`);
    console.log(`✅ 成功率: ${((totalReports / (totalReports + totalErrors)) * 100).toFixed(2)}%`);
    console.log(`❌ 错误次数: ${totalErrors}`);
    console.log(`📊 模拟总流量: ${formatBytes(totalSimulated)}`);
    
    if (finalQuerySuccess) {
      console.log(`📊 用户总流量: ${formatBytes(finalTotalTraffic)}`);
      console.log(`📊 流量差异: ${formatBytes(Math.abs(totalSimulated - finalTotalTraffic))}`);
      console.log(`📊 平均吞吐量: ${(finalTotalTraffic / testDurationSeconds / 1024 / 1024).toFixed(2)}MB/s`);
      console.log(`🎯 1TB目标达成: ${achievedPercentage}%`);
      
      const ratio = totalSimulated > 0 ? (finalTotalTraffic / totalSimulated).toFixed(6) : 0;
      console.log(`📊 放大倍数: ${ratio}x`);
      
      const isAccurate = Math.abs(totalSimulated - finalTotalTraffic) < totalSimulated * 0.01; // 1%容差
      console.log(`🔧 数据一致性: ${isAccurate ? '✅ 优秀' : '⚠️ 需优化'}`);
      
      if (isAccurate) {
        console.log('\n🎉 真正的1TB长时间测试通过！系统在长时间高负载下表现卓越！');
        console.log('✅ 流量统计精确，完全适合企业级生产环境部署');
        console.log('🚀 您的GOST管理系统已达到工业级标准！');
        
        if (parseFloat(achievedPercentage) >= 95) {
          console.log('🏆 恭喜！成功达到1TB流量目标！');
        }
      } else {
        console.log('\n⚠️ 真正的1TB长时间测试发现优化空间');
        console.log('🔍 在长时间高负载下可能需要进一步调优');
      }
    } else {
      console.log('❌ 无法获取最终用户流量数据，请手动检查');
    }

    console.log('\n🚀 真正的1TB长时间测试完成');

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  }
}

real1TBTest();
