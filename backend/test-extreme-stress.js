/**
 * 极限压力测试 - 复杂多场景长时间测试
 * 10分钟测试，3个端口，每个端口200+次变化，模拟极端使用情况
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
      timeout: 3000 // 缩短超时以增加压力
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

class ExtremeStressSimulator {
  constructor(authToken) {
    this.authToken = authToken;
    this.testStartTime = Date.now();
    this.testDuration = 10 * 60 * 1000; // 10分钟
    this.ports = [
      { port: 6443, service: 'forward-tcp-6443', user: 'admin', userId: 1 },
      { port: 2999, service: 'forward-tcp-2999', user: 'test', userId: 2 },
      { port: 8080, service: 'forward-tcp-8080', user: 'admin', userId: 1 }
    ];
    
    // 极端复杂的流量模式
    this.extremePatterns = [
      { name: '微小数据包', minBytes: 64, maxBytes: 1024, frequency: 'high' },
      { name: '小文件传输', minBytes: 1024, maxBytes: 102400, frequency: 'high' },
      { name: '中等文件', minBytes: 102400, maxBytes: 2097152, frequency: 'medium' },
      { name: '大文件传输', minBytes: 2097152, maxBytes: 20971520, frequency: 'medium' },
      { name: '视频流媒体', minBytes: 10485760, maxBytes: 104857600, frequency: 'low' },
      { name: '突发大流量', minBytes: 52428800, maxBytes: 209715200, frequency: 'rare' },
      { name: '极限突发', minBytes: 104857600, maxBytes: 524288000, frequency: 'rare' }
    ];
    
    // 累积流量跟踪
    this.portCumulativeTraffic = {};
    this.ports.forEach(p => {
      this.portCumulativeTraffic[p.port] = {
        inputBytes: 0,
        outputBytes: 0,
        changeCount: 0,
        lastUpdate: 0,
        totalSimulated: 0,
        errorCount: 0,
        patternHistory: []
      };
    });
    
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.timeoutRequests = 0;
    this.isRunning = false;
    
    // 压力测试配置
    this.stressConfig = {
      maxConcurrentRequests: 5, // 并发请求数
      burstMode: false, // 突发模式
      chaosMode: false, // 混沌模式（随机错误）
      memoryPressure: false // 内存压力模式
    };
  }

  // 生成极端复杂的流量模式
  generateExtremeTrafficPattern(changeCount, port, timeProgress) {
    // 根据时间进度调整模式
    let selectedPatterns;
    if (timeProgress < 0.2) {
      // 前20%：高频小数据包
      selectedPatterns = this.extremePatterns.filter(p => p.frequency === 'high');
    } else if (timeProgress < 0.5) {
      // 20%-50%：混合模式
      selectedPatterns = this.extremePatterns.filter(p => p.frequency !== 'rare');
    } else if (timeProgress < 0.8) {
      // 50%-80%：大流量模式
      selectedPatterns = this.extremePatterns.filter(p => p.frequency !== 'high');
    } else {
      // 最后20%：极限模式
      selectedPatterns = this.extremePatterns;
    }
    
    const pattern = selectedPatterns[changeCount % selectedPatterns.length];
    
    // 端口特异性调整
    let inputMultiplier = 1;
    let outputMultiplier = 1;
    
    switch (port) {
      case 6443: // admin 主端口 - 下载为主
        inputMultiplier = 0.2 + Math.random() * 0.3; // 20%-50%
        outputMultiplier = 2 + Math.random() * 3; // 200%-500%
        break;
      case 2999: // test 端口 - 上传为主
        inputMultiplier = 1.5 + Math.random() * 2.5; // 150%-400%
        outputMultiplier = 0.1 + Math.random() * 0.4; // 10%-50%
        break;
      case 8080: // admin 辅助端口 - 对称传输
        inputMultiplier = 0.8 + Math.random() * 0.4; // 80%-120%
        outputMultiplier = 0.8 + Math.random() * 0.4; // 80%-120%
        break;
    }
    
    // 时间波动因子
    const timeWave = Math.sin(timeProgress * Math.PI * 4) * 0.3 + 0.7; // 0.4-1.0
    
    // 随机突发因子
    const burstFactor = Math.random() < 0.05 ? 2 + Math.random() * 3 : 1; // 5%概率突发
    
    const baseIncrement = this.generateRandomBytes(pattern);
    const inputIncrement = Math.floor(baseIncrement * inputMultiplier * timeWave * burstFactor);
    const outputIncrement = Math.floor(baseIncrement * outputMultiplier * timeWave * burstFactor);
    
    return {
      pattern: pattern.name,
      inputIncrement,
      outputIncrement,
      timeWave: timeWave.toFixed(2),
      burstFactor: burstFactor.toFixed(2),
      complexity: this.calculateComplexity(inputIncrement, outputIncrement)
    };
  }

  generateRandomBytes(pattern) {
    const { minBytes, maxBytes } = pattern;
    return Math.floor(Math.random() * (maxBytes - minBytes)) + minBytes;
  }

  calculateComplexity(input, output) {
    const total = input + output;
    if (total < 1024) return 'micro';
    if (total < 1048576) return 'small';
    if (total < 10485760) return 'medium';
    if (total < 104857600) return 'large';
    return 'extreme';
  }

  // 发送观察器数据（带重试机制）
  async sendObserverDataWithRetry(port, inputBytes, outputBytes, metadata = {}, maxRetries = 3) {
    const portInfo = this.ports.find(p => p.port === port);
    if (!portInfo) return false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const observerData = {
          events: [
            {
              kind: "service",
              service: portInfo.service,
              type: "stats",
              stats: {
                totalConns: Math.floor(Math.random() * 50) + 1,
                currentConns: Math.floor(Math.random() * 10),
                inputBytes: inputBytes,
                outputBytes: outputBytes,
                totalErrs: Math.floor(Math.random() * 5)
              },
              metadata: {
                ...metadata,
                attempt,
                timestamp: Date.now()
              }
            }
          ]
        };

        const response = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', observerData);
        this.totalRequests++;
        
        if (response.statusCode === 200) {
          this.successfulRequests++;
          return true;
        } else {
          this.failedRequests++;
          if (attempt === maxRetries) {
            console.log(`❌ 端口 ${port} 最终失败: ${response.statusCode}`);
          }
        }
      } catch (error) {
        if (error.message === 'Request timeout') {
          this.timeoutRequests++;
        } else {
          this.failedRequests++;
        }
        
        if (attempt === maxRetries) {
          console.log(`❌ 端口 ${port} 重试失败: ${error.message}`);
        } else {
          await sleep(100 * attempt); // 递增延迟
        }
      }
    }
    
    return false;
  }

  // 获取用户流量统计
  async getUserTrafficStats() {
    try {
      const response = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
        'Authorization': this.authToken
      });
      
      if (response.statusCode === 200) {
        const users = response.data;
        const stats = {};
        
        users.forEach(user => {
          stats[user.id] = {
            username: user.username,
            usedTraffic: user.usedTraffic || 0
          };
        });
        
        return stats;
      }
    } catch (error) {
      console.log('⚠️ 获取用户流量统计失败:', error.message);
    }
    
    return {};
  }

  // 极端压力端口模拟
  async simulateExtremePortTraffic(portInfo) {
    const port = portInfo.port;
    const portTraffic = this.portCumulativeTraffic[port];
    
    console.log(`🚀 启动端口 ${port} (${portInfo.user}) 的极限压力测试`);
    
    while (this.isRunning && (Date.now() - this.testStartTime) < this.testDuration) {
      try {
        const timeElapsed = Date.now() - this.testStartTime;
        const timeProgress = timeElapsed / this.testDuration;
        
        // 生成极端复杂的流量模式
        const trafficPattern = this.generateExtremeTrafficPattern(portTraffic.changeCount, port, timeProgress);
        
        // 累积流量
        portTraffic.inputBytes += trafficPattern.inputIncrement;
        portTraffic.outputBytes += trafficPattern.outputIncrement;
        portTraffic.totalSimulated += trafficPattern.inputIncrement + trafficPattern.outputIncrement;
        portTraffic.changeCount++;
        portTraffic.lastUpdate = Date.now();
        portTraffic.patternHistory.push({
          pattern: trafficPattern.pattern,
          complexity: trafficPattern.complexity,
          timestamp: Date.now()
        });
        
        // 保持历史记录在合理范围内
        if (portTraffic.patternHistory.length > 100) {
          portTraffic.patternHistory = portTraffic.patternHistory.slice(-50);
        }
        
        // 发送观察器数据
        const success = await this.sendObserverDataWithRetry(
          port, 
          portTraffic.inputBytes, 
          portTraffic.outputBytes,
          {
            pattern: trafficPattern.pattern,
            changeCount: portTraffic.changeCount,
            timeProgress: timeProgress.toFixed(3),
            complexity: trafficPattern.complexity
          }
        );
        
        if (!success) {
          portTraffic.errorCount++;
        }
        
        // 详细日志 (每50次变化)
        if (portTraffic.changeCount % 50 === 0) {
          const elapsed = Math.floor(timeElapsed / 1000);
          const minutes = Math.floor(elapsed / 60);
          const seconds = elapsed % 60;
          
          console.log(`📊 端口 ${port} (${portInfo.user}): ${portTraffic.changeCount} 次变化`);
          console.log(`   累积流量: ${formatBytes(portTraffic.totalSimulated)}`);
          console.log(`   当前模式: ${trafficPattern.pattern} (${trafficPattern.complexity})`);
          console.log(`   错误次数: ${portTraffic.errorCount}, 耗时: ${minutes}:${seconds.toString().padStart(2, '0')}`);
        }
        
        // 动态间隔调整（根据时间进度和复杂度）
        let baseInterval;
        if (timeProgress < 0.3) {
          baseInterval = 100 + Math.random() * 200; // 前期高频: 0.1-0.3s
        } else if (timeProgress < 0.7) {
          baseInterval = 50 + Math.random() * 150; // 中期极高频: 0.05-0.2s
        } else {
          baseInterval = 30 + Math.random() * 100; // 后期疯狂: 0.03-0.13s
        }
        
        // 复杂度调整
        const complexityMultiplier = {
          'micro': 0.5,
          'small': 0.7,
          'medium': 1.0,
          'large': 1.5,
          'extreme': 2.0
        }[trafficPattern.complexity] || 1.0;
        
        const finalInterval = baseInterval * complexityMultiplier;
        await sleep(finalInterval);
        
      } catch (error) {
        console.error(`❌ 端口 ${port} 极限测试异常:`, error);
        portTraffic.errorCount++;
        await sleep(1000);
      }
    }
    
    console.log(`🏁 端口 ${port} (${portInfo.user}) 极限测试完成:`);
    console.log(`   变化次数: ${portTraffic.changeCount}`);
    console.log(`   模拟总流量: ${formatBytes(portTraffic.totalSimulated)}`);
    console.log(`   错误次数: ${portTraffic.errorCount}`);
    console.log(`   成功率: ${((portTraffic.changeCount - portTraffic.errorCount) / portTraffic.changeCount * 100).toFixed(2)}%`);
  }

  // 启动极限压力测试
  async startExtremeStressTest() {
    console.log('🔥 开始极限压力测试...');
    console.log(`⏱️ 测试时长: 10分钟`);
    console.log(`🔌 测试端口: ${this.ports.map(p => `${p.port}(${p.user})`).join(', ')}`);
    console.log(`🎯 目标: 每个端口200+次流量变化`);
    console.log(`💥 压力级别: 极限模式\n`);
    
    // 重置所有用户流量
    console.log('🔄 重置所有用户流量...');
    for (const portInfo of this.ports) {
      try {
        const resetResponse = await makeHttpRequest('POST', `http://localhost:3000/api/users/${portInfo.userId}/reset-traffic`, {
          reason: '极限压力测试'
        }, {
          'Authorization': this.authToken
        });
        
        if (resetResponse.statusCode === 200) {
          console.log(`✅ 用户 ${portInfo.user} 流量重置成功`);
        }
      } catch (error) {
        console.log(`❌ 重置用户 ${portInfo.user} 流量失败:`, error.message);
      }
    }
    
    await sleep(3000);
    
    // 获取初始流量状态
    const initialStats = await this.getUserTrafficStats();
    console.log('\n📊 初始流量状态:');
    Object.values(initialStats).forEach(user => {
      console.log(`  ${user.username}: ${formatBytes(user.usedTraffic)}`);
    });
    
    this.isRunning = true;
    
    // 并行启动所有端口的极限压力测试
    const simulationPromises = this.ports.map(portInfo => 
      this.simulateExtremePortTraffic(portInfo)
    );
    
    // 高频进度报告 (每60秒)
    const progressInterval = setInterval(async () => {
      const elapsed = Math.floor((Date.now() - this.testStartTime) / 1000);
      const remaining = Math.max(0, 600 - elapsed);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      
      console.log(`\n🔥 极限压力报告 (${minutes}:${seconds.toString().padStart(2, '0')} / 10:00, 剩余 ${Math.floor(remaining/60)}:${(remaining%60).toString().padStart(2, '0')}):`);
      console.log(`📡 请求统计: 总计 ${this.totalRequests}, 成功 ${this.successfulRequests}, 失败 ${this.failedRequests}, 超时 ${this.timeoutRequests}`);
      console.log(`📊 成功率: ${((this.successfulRequests / this.totalRequests) * 100).toFixed(2)}%`);
      
      // 获取当前用户流量
      const currentStats = await this.getUserTrafficStats();
      
      this.ports.forEach(portInfo => {
        const portTraffic = this.portCumulativeTraffic[portInfo.port];
        const userStats = currentStats[portInfo.userId];
        const userTraffic = userStats ? userStats.usedTraffic : 0;
        const initialTraffic = initialStats[portInfo.userId] ? initialStats[portInfo.userId].usedTraffic : 0;
        const userIncrease = userTraffic - initialTraffic;
        
        console.log(`  🔌 端口 ${portInfo.port} (${portInfo.user}):`);
        console.log(`    变化: ${portTraffic.changeCount}, 错误: ${portTraffic.errorCount}`);
        console.log(`    模拟: ${formatBytes(portTraffic.totalSimulated)}, 用户: ${formatBytes(userIncrease)}`);
        
        const consistency = Math.abs(portTraffic.totalSimulated - userIncrease) < 52428800; // 允许50MB误差
        console.log(`    一致性: ${consistency ? '✅' : '❌'}`);
      });
    }, 60000); // 每60秒报告一次
    
    // 等待所有模拟完成
    await Promise.race([
      Promise.all(simulationPromises),
      sleep(this.testDuration + 30000) // 额外30秒缓冲
    ]);
    
    this.isRunning = false;
    clearInterval(progressInterval);
    
    // 生成最终极限测试报告
    await this.generateExtremeTestReport(initialStats);
  }

  // 生成极限测试报告
  async generateExtremeTestReport(initialStats) {
    console.log('\n🔥 极限压力测试完成！\n');
    
    await sleep(5000); // 等待最后的数据处理
    const finalStats = await this.getUserTrafficStats();
    
    console.log('📈 极限测试最终报告:');
    console.log('='.repeat(80));
    
    // 请求统计
    const successRate = (this.successfulRequests / this.totalRequests) * 100;
    const timeoutRate = (this.timeoutRequests / this.totalRequests) * 100;
    
    console.log(`📡 极限请求统计:`);
    console.log(`  总请求数: ${this.totalRequests}`);
    console.log(`  成功请求: ${this.successfulRequests}`);
    console.log(`  失败请求: ${this.failedRequests}`);
    console.log(`  超时请求: ${this.timeoutRequests}`);
    console.log(`  成功率: ${successRate.toFixed(2)}%`);
    console.log(`  超时率: ${timeoutRate.toFixed(2)}%`);
    
    // 极限端口统计
    console.log(`\n🔌 极限端口统计:`);
    let totalSimulated = 0;
    let totalUserIncrease = 0;
    let allPortsReachedTarget = true;
    let extremeConsistencyPassed = true;
    
    this.ports.forEach(portInfo => {
      const portTraffic = this.portCumulativeTraffic[portInfo.port];
      const initialTraffic = initialStats[portInfo.userId] ? initialStats[portInfo.userId].usedTraffic : 0;
      const finalTraffic = finalStats[portInfo.userId] ? finalStats[portInfo.userId].usedTraffic : 0;
      const userIncrease = finalTraffic - initialTraffic;
      const difference = Math.abs(portTraffic.totalSimulated - userIncrease);
      const consistencyPassed = difference < 52428800; // 允许50MB误差
      const portSuccessRate = ((portTraffic.changeCount - portTraffic.errorCount) / portTraffic.changeCount * 100);
      
      totalSimulated += portTraffic.totalSimulated;
      totalUserIncrease += userIncrease;
      
      if (portTraffic.changeCount < 200) allPortsReachedTarget = false;
      if (!consistencyPassed) extremeConsistencyPassed = false;
      
      console.log(`  端口 ${portInfo.port} (${portInfo.user}):`);
      console.log(`    变化次数: ${portTraffic.changeCount} ${portTraffic.changeCount >= 200 ? '✅' : '❌'}`);
      console.log(`    成功率: ${portSuccessRate.toFixed(2)}%`);
      console.log(`    模拟流量: ${formatBytes(portTraffic.totalSimulated)}`);
      console.log(`    用户增量: ${formatBytes(userIncrease)}`);
      console.log(`    差异: ${formatBytes(difference)}`);
      console.log(`    一致性: ${consistencyPassed ? '✅ 通过' : '❌ 异常'}`);
    });
    
    // 极限总体评估
    console.log(`\n🔍 极限总体评估:`);
    console.log(`  模拟总流量: ${formatBytes(totalSimulated)}`);
    console.log(`  用户总增量: ${formatBytes(totalUserIncrease)}`);
    console.log(`  总体差异: ${formatBytes(Math.abs(totalSimulated - totalUserIncrease))}`);
    console.log(`  总体一致性: ${Math.abs(totalSimulated - totalUserIncrease) < 104857600 ? '✅ 通过' : '❌ 异常'}`);
    
    // 极限测试结论
    console.log(`\n📝 极限测试结论:`);
    const overallConsistency = Math.abs(totalSimulated - totalUserIncrease) < 104857600;
    
    console.log(`1. 极限变化测试: ${allPortsReachedTarget ? '✅ 通过' : '❌ 未达标'} (目标: 200+次/端口)`);
    console.log(`2. 极限成功率: ${successRate >= 85 ? '✅ 优秀' : successRate >= 70 ? '⚠️ 良好' : '❌ 需优化'} (${successRate.toFixed(2)}%)`);
    console.log(`3. 超时控制: ${timeoutRate <= 10 ? '✅ 优秀' : timeoutRate <= 20 ? '⚠️ 可接受' : '❌ 过高'} (${timeoutRate.toFixed(2)}%)`);
    console.log(`4. 多端口并发: ${this.ports.length >= 3 ? '✅ 通过' : '❌ 未达标'}`);
    console.log(`5. 极限一致性: ${extremeConsistencyPassed && overallConsistency ? '✅ 通过' : '❌ 异常'}`);
    console.log(`6. 系统稳定性: ${successRate >= 70 && timeoutRate <= 20 ? '✅ 稳定' : '❌ 不稳定'}`);
    
    const overallResult = allPortsReachedTarget && successRate >= 70 && timeoutRate <= 20 && extremeConsistencyPassed && overallConsistency;
    console.log(`\n🏆 极限测试评价: ${overallResult ? '✅ 系统通过极限测试' : '❌ 系统需要优化'}`);
    
    if (overallResult) {
      console.log('\n🎊 恭喜！系统通过极限压力测试！');
      console.log('✅ 高并发处理能力优秀');
      console.log('✅ 数据一致性在极限条件下保持良好');
      console.log('✅ 错误处理机制有效');
      console.log('✅ 系统稳定性优秀');
    } else {
      console.log('\n⚠️ 系统在极限条件下存在优化空间');
      console.log('建议检查：并发处理、错误恢复、数据一致性机制');
    }
  }
}

// 格式化字节数显示
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

// 延迟函数
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 主函数
async function runExtremeStressTest() {
  try {
    console.log('🔐 获取管理员 token...');
    const authToken = await getAuthToken();
    console.log('✅ 登录成功\n');
    
    const simulator = new ExtremeStressSimulator(authToken);
    await simulator.startExtremeStressTest();
  } catch (error) {
    console.error('❌ 极限压力测试失败:', error);
  }
}

// 运行极限测试
runExtremeStressTest();
