/**
 * 🎯 流量统计精确度测试
 * 基于 test-super-extreme.js 和 test-real-1tb.js 的设计
 * 专门测试系统流量统计的准确性和精确度
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

  return `${size.toFixed(unitIndex === 0 ? 0 : 2)}${units[unitIndex]}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 🎯 精确度测试模式定义
const ACCURACY_TEST_MODES = [
  { name: '精确小包', size: 1024, count: 1000, description: '1KB x 1000次 = 1MB' },
  { name: '中等数据', size: 10 * 1024, count: 100, description: '10KB x 100次 = 1MB' },
  { name: '大数据包', size: 100 * 1024, count: 10, description: '100KB x 10次 = 1MB' },
  { name: '超大包', size: 1024 * 1024, count: 1, description: '1MB x 1次 = 1MB' },
  { name: '混合模式', size: 'mixed', count: 'mixed', description: '随机大小混合传输' }
];

// 🎯 精确度测试类
class AccuracyTest {
  constructor(port, userId, username, mode) {
    this.port = port;
    this.userId = userId;
    this.username = username;
    this.mode = mode;
    this.totalSimulated = 0;
    this.successCount = 0;
    this.errorCount = 0;
    this.startTime = Date.now();
  }

  // 生成精确的测试数据
  generatePreciseTraffic(iteration) {
    if (this.mode.name === '混合模式') {
      // 混合模式：随机大小但总量可预测
      const sizes = [1024, 2048, 4096, 8192, 16384, 32768, 65536];
      const size = sizes[iteration % sizes.length];
      return {
        inputBytes: Math.floor(size * 0.3),
        outputBytes: Math.floor(size * 0.7),
        totalBytes: size
      };
    } else {
      // 固定模式：精确大小
      return {
        inputBytes: Math.floor(this.mode.size * 0.3),
        outputBytes: Math.floor(this.mode.size * 0.7),
        totalBytes: this.mode.size
      };
    }
  }

  // 执行精确度测试
  async runAccuracyTest() {
    console.log(`🎯 开始 ${this.username} 端口${this.port} 的精确度测试: ${this.mode.name}`);
    console.log(`📊 测试描述: ${this.mode.description}`);

    const iterations = this.mode.count === 'mixed' ? 100 : this.mode.count;

    for (let i = 0; i < iterations; i++) {
      try {
        const traffic = this.generatePreciseTraffic(i);
        this.totalSimulated += traffic.totalBytes;

        const observerData = {
          events: [
            {
              kind: "service",
              service: `forward-tcp-${this.port}`,
              type: "stats",
              stats: {
                totalConns: i + 1,
                currentConns: 1,
                inputBytes: traffic.inputBytes,
                outputBytes: traffic.outputBytes,
                totalErrs: 0
              }
            }
          ]
        };

        const response = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', observerData);

        if (response.statusCode === 200) {
          this.successCount++;
        } else {
          this.errorCount++;
        }

        // 每100次报告进度
        if ((i + 1) % 100 === 0) {
          console.log(`📊 ${this.username}: 完成 ${i + 1}/${iterations}, 累积 ${formatBytes(this.totalSimulated)}`);
        }

        // 精确控制间隔
        await sleep(50);

      } catch (error) {
        this.errorCount++;
        await sleep(100);
      }
    }

    return {
      port: this.port,
      username: this.username,
      mode: this.mode.name,
      totalSimulated: this.totalSimulated,
      successCount: this.successCount,
      errorCount: this.errorCount,
      duration: Date.now() - this.startTime
    };
  }
}

// 🎯 获取用户流量状态
async function getUserTrafficStatus(authToken) {
  const response = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
    'Authorization': authToken
  });

  if (response.statusCode === 200) {
    const users = {};
    response.data.forEach(user => {
      users[user.username] = user.usedTraffic || 0;
    });
    return users;
  }
  return null;
}

// 🎯 重置用户流量
async function resetUserTraffic(authToken, userId, username) {
  const response = await makeHttpRequest('POST', `http://localhost:3000/api/users/${userId}/reset-traffic`, {
    reason: '流量精确度测试重置'
  }, {
    'Authorization': authToken
  });

  return response.statusCode === 200;
}

// 🎯 主测试函数
async function runTrafficAccuracyTest() {
  console.log('🎯 开始流量统计精确度测试...\n');
  console.log('📊 测试目标:');
  console.log('   1. 验证不同大小数据包的统计精确度');
  console.log('   2. 测试累积统计的准确性');
  console.log('   3. 分析系统的统计误差范围');
  console.log('   4. 评估企业级应用的可靠性\n');

  let authToken;
  try {
    console.log('🔐 获取管理员 token...');
    authToken = await getAuthToken();
    console.log('✅ 登录成功\n');
  } catch (error) {
    console.error('❌ 获取 token 失败:', error.message);
    return;
  }

  const testResults = [];

  // 对每种模式进行测试
  for (let modeIndex = 0; modeIndex < ACCURACY_TEST_MODES.length; modeIndex++) {
    const mode = ACCURACY_TEST_MODES[modeIndex];

    console.log(`\n🎯 ========== 测试模式 ${modeIndex + 1}/${ACCURACY_TEST_MODES.length}: ${mode.name} ==========`);

    // 1. 重置所有用户流量
    console.log('1. 重置用户流量...');
    await resetUserTraffic(authToken, 1, 'admin');
    await resetUserTraffic(authToken, 2, 'test');
    await sleep(2000);

    // 2. 获取初始状态
    const initialTraffic = await getUserTrafficStatus(authToken);
    console.log('📊 初始流量状态:');
    Object.entries(initialTraffic).forEach(([username, traffic]) => {
      console.log(`   ${username}: ${formatBytes(traffic)}`);
    });

    // 3. 执行精确度测试
    console.log('\n2. 执行精确度测试...');
    const tests = [
      new AccuracyTest(9080, 1, 'admin', mode),
      new AccuracyTest(6443, 2, 'test', mode)
    ];

    const results = await Promise.allSettled(tests.map(test => test.runAccuracyTest()));

    // 4. 等待系统处理
    console.log('\n3. 等待系统处理完成...');
    await sleep(5000);

    // 5. 获取最终状态
    const finalTraffic = await getUserTrafficStatus(authToken);
    console.log('📊 最终流量状态:');
    Object.entries(finalTraffic).forEach(([username, traffic]) => {
      console.log(`   ${username}: ${formatBytes(traffic)}`);
    });

    // 6. 分析精确度
    console.log('\n4. 精确度分析:');
    let totalSimulated = 0;
    let totalActual = 0;

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const stats = result.value;
        const actualTraffic = finalTraffic[stats.username] - initialTraffic[stats.username];
        const accuracy = actualTraffic > 0 ? (stats.totalSimulated / actualTraffic * 100).toFixed(4) : 0;
        const error = Math.abs(stats.totalSimulated - actualTraffic);
        const errorPercent = stats.totalSimulated > 0 ? (error / stats.totalSimulated * 100).toFixed(4) : 0;

        totalSimulated += stats.totalSimulated;
        totalActual += actualTraffic;

        console.log(`📊 ${stats.username} (端口${stats.port}):`);
        console.log(`   模拟流量: ${formatBytes(stats.totalSimulated)}`);
        console.log(`   实际流量: ${formatBytes(actualTraffic)}`);
        console.log(`   精确度: ${accuracy}%`);
        console.log(`   误差: ${formatBytes(error)} (${errorPercent}%)`);
        console.log(`   成功率: ${(stats.successCount / (stats.successCount + stats.errorCount) * 100).toFixed(2)}%`);
      }
    });

    // 7. 总体精确度
    const overallAccuracy = totalActual > 0 ? (totalSimulated / totalActual * 100).toFixed(4) : 0;
    const overallError = Math.abs(totalSimulated - totalActual);
    const overallErrorPercent = totalSimulated > 0 ? (overallError / totalSimulated * 100).toFixed(4) : 0;

    console.log(`\n📊 ${mode.name} 总体精确度:`);
    console.log(`   总模拟流量: ${formatBytes(totalSimulated)}`);
    console.log(`   总实际流量: ${formatBytes(totalActual)}`);
    console.log(`   总体精确度: ${overallAccuracy}%`);
    console.log(`   总体误差: ${formatBytes(overallError)} (${overallErrorPercent}%)`);

    // 保存结果
    testResults.push({
      mode: mode.name,
      description: mode.description,
      totalSimulated,
      totalActual,
      accuracy: parseFloat(overallAccuracy),
      errorBytes: overallError,
      errorPercent: parseFloat(overallErrorPercent)
    });

    console.log(`⏸️ 模式间隔等待 3秒...`);
    await sleep(3000);
  }

  // 🎯 最终精确度报告
  console.log('\n🎯 ========== 流量统计精确度测试最终报告 ==========');
  console.log('='.repeat(80));

  testResults.forEach((result, index) => {
    const grade = result.errorPercent < 1 ? '🏆 优秀' :
                  result.errorPercent < 5 ? '✅ 良好' :
                  result.errorPercent < 10 ? '⚠️ 一般' : '❌ 需优化';

    console.log(`📊 ${index + 1}. ${result.mode}:`);
    console.log(`   描述: ${result.description}`);
    console.log(`   精确度: ${result.accuracy.toFixed(4)}%`);
    console.log(`   误差率: ${result.errorPercent.toFixed(4)}%`);
    console.log(`   评级: ${grade}\n`);
  });

  // 计算平均精确度
  const avgAccuracy = testResults.reduce((sum, r) => sum + r.accuracy, 0) / testResults.length;
  const avgErrorPercent = testResults.reduce((sum, r) => sum + r.errorPercent, 0) / testResults.length;

  console.log(`📊 平均精确度: ${avgAccuracy.toFixed(4)}%`);
  console.log(`📊 平均误差率: ${avgErrorPercent.toFixed(4)}%`);

  const overallGrade = avgErrorPercent < 1 ? '🏆 优秀' :
                       avgErrorPercent < 5 ? '✅ 良好' :
                       avgErrorPercent < 10 ? '⚠️ 一般' : '❌ 需优化';

  console.log(`🏆 系统总体评级: ${overallGrade}`);

  if (avgErrorPercent < 1) {
    console.log('\n🎉 恭喜！您的系统流量统计精确度达到企业级标准！');
    console.log('✅ 误差率小于1%，完全适合生产环境部署');
    console.log('🚀 可以放心用于计费、监控和流量管理');
  } else if (avgErrorPercent < 5) {
    console.log('\n✅ 您的系统流量统计精确度良好！');
    console.log('📊 误差率在可接受范围内，适合大多数应用场景');
  } else {
    console.log('\n⚠️ 您的系统流量统计精确度需要优化');
    console.log('🔧 建议检查观察器处理逻辑和数据库更新机制');
  }

  console.log('\n🎯 流量统计精确度测试完成！');
}

// 运行测试
runTrafficAccuracyTest();
