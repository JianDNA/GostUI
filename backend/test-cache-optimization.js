/**
 * 认证器缓存优化验证测试
 * 验证多层缓存、预热机制和性能提升效果
 */

const gostAuthService = require('./services/gostAuthService');

// 模拟测试数据
const mockPortMapping = {
  6443: { userId: 1, username: 'testuser1', ruleId: 1, ruleName: 'test-rule-1' },
  6444: { userId: 2, username: 'testuser2', ruleId: 2, ruleName: 'test-rule-2' },
  6445: { userId: 3, username: 'testuser3', ruleId: 3, ruleName: 'test-rule-3' }
};

const mockUsers = {
  1: { id: 1, username: 'testuser1', role: 'user', isActive: true, userStatus: 'active' },
  2: { id: 2, username: 'testuser2', role: 'user', isActive: true, userStatus: 'active' },
  3: { id: 3, username: 'testuser3', role: 'admin', isActive: true, userStatus: 'active' }
};

// 模拟多实例缓存服务
const mockMultiInstanceCacheService = {
  getPortUserMapping: () => mockPortMapping,
  getUserCache: (userId) => mockUsers[userId] || null
};

// 替换真实的多实例缓存服务
require.cache[require.resolve('./services/multiInstanceCacheService')] = {
  exports: mockMultiInstanceCacheService
};

// 格式化时间
function formatTime(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(1)}μs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// 统计分析
function analyzeResults(results) {
  const sorted = results.sort((a, b) => a - b);
  const len = sorted.length;
  
  return {
    min: sorted[0],
    max: sorted[len - 1],
    avg: sorted.reduce((a, b) => a + b, 0) / len,
    p50: sorted[Math.floor(len * 0.5)],
    p90: sorted[Math.floor(len * 0.9)],
    p95: sorted[Math.floor(len * 0.95)]
  };
}

// 测试认证性能
async function testAuthPerformance(testName, iterations = 50) {
  console.log(`\n📊 ${testName}...`);
  const results = [];
  
  for (let i = 0; i < iterations; i++) {
    const startTime = process.hrtime.bigint();
    
    const request = {
      service: 'forward-tcp-6443',
      network: 'tcp',
      addr: '127.0.0.1:6443',
      src: '127.0.0.1:12345'
    };
    
    const result = await gostAuthService.handleAuthRequest(request);
    
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // 转换为毫秒
    
    if (result.ok) {
      results.push(duration);
      if (i < 5 || i % 10 === 0) {
        console.log(`   第${i+1}次: ${formatTime(duration)}`);
      }
    }
    
    // 小延迟避免过快请求
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  return results;
}

// 主测试函数
async function runCacheOptimizationTest() {
  try {
    console.log('🚀 认证器缓存优化验证测试');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // 1. 获取初始统计信息
    console.log('📊 初始状态:');
    const initialStats = gostAuthService.getAuthStats();
    console.log(`   端口映射缓存: ${initialStats.portMappingCacheSize}`);
    console.log(`   用户数据缓存: ${initialStats.userDataCacheSize}`);
    console.log(`   认证结果缓存: ${initialStats.authResultCacheSize}`);
    console.log(`   缓存命中率: ${initialStats.cacheHitRate}`);
    
    // 2. 测试冷启动性能 (缓存为空)
    gostAuthService.clearAllCache();
    const coldStartResults = await testAuthPerformance('冷启动性能测试 (无缓存)', 20);
    
    // 3. 测试预热缓存
    console.log('\n🔥 执行缓存预热...');
    await gostAuthService.preloadCache();
    
    const preloadStats = gostAuthService.getAuthStats();
    console.log(`✅ 预热完成: 端口映射${preloadStats.portMappingCacheSize}, 用户数据${preloadStats.userDataCacheSize}`);
    
    // 4. 测试预热后性能
    const preloadResults = await testAuthPerformance('预热后性能测试', 30);
    
    // 5. 测试缓存命中性能
    const cacheHitResults = await testAuthPerformance('缓存命中性能测试', 50);
    
    // 6. 测试不同端口的性能
    console.log('\n📊 测试不同端口认证性能...');
    const multiPortResults = [];
    for (const port of [6443, 6444, 6445]) {
      const request = {
        service: `forward-tcp-${port}`,
        network: 'tcp',
        addr: `127.0.0.1:${port}`,
        src: '127.0.0.1:12345'
      };
      
      const startTime = process.hrtime.bigint();
      const result = await gostAuthService.handleAuthRequest(request);
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;
      
      if (result.ok) {
        multiPortResults.push(duration);
        console.log(`   端口${port}: ${formatTime(duration)}`);
      }
    }
    
    // 7. 分析结果
    console.log('\n📈 性能分析结果');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (coldStartResults.length > 0) {
      const coldStats = analyzeResults(coldStartResults);
      console.log('\n🥶 冷启动性能 (无缓存):');
      console.log(`   平均延迟: ${formatTime(coldStats.avg)}`);
      console.log(`   P50延迟:  ${formatTime(coldStats.p50)}`);
      console.log(`   P95延迟:  ${formatTime(coldStats.p95)}`);
      console.log(`   最大延迟: ${formatTime(coldStats.max)}`);
    }
    
    if (preloadResults.length > 0) {
      const preloadStats = analyzeResults(preloadResults);
      console.log('\n🔥 预热后性能:');
      console.log(`   平均延迟: ${formatTime(preloadStats.avg)}`);
      console.log(`   P50延迟:  ${formatTime(preloadStats.p50)}`);
      console.log(`   P95延迟:  ${formatTime(preloadStats.p95)}`);
      console.log(`   最大延迟: ${formatTime(preloadStats.max)}`);
    }
    
    if (cacheHitResults.length > 0) {
      const cacheStats = analyzeResults(cacheHitResults);
      console.log('\n⚡ 缓存命中性能:');
      console.log(`   平均延迟: ${formatTime(cacheStats.avg)}`);
      console.log(`   P50延迟:  ${formatTime(cacheStats.p50)}`);
      console.log(`   P95延迟:  ${formatTime(cacheStats.p95)}`);
      console.log(`   最大延迟: ${formatTime(cacheStats.max)}`);
    }
    
    if (multiPortResults.length > 0) {
      const multiStats = analyzeResults(multiPortResults);
      console.log('\n🔀 多端口性能:');
      console.log(`   平均延迟: ${formatTime(multiStats.avg)}`);
      console.log(`   最大延迟: ${formatTime(multiStats.max)}`);
    }
    
    // 8. 优化效果分析
    console.log('\n🚀 优化效果分析');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (coldStartResults.length > 0 && cacheHitResults.length > 0) {
      const coldAvg = analyzeResults(coldStartResults).avg;
      const cacheAvg = analyzeResults(cacheHitResults).avg;
      const improvement = ((coldAvg - cacheAvg) / coldAvg * 100).toFixed(1);
      
      console.log(`✅ 缓存优化效果: 延迟减少 ${improvement}%`);
      console.log(`📊 性能提升倍数: ${(coldAvg / cacheAvg).toFixed(1)}x`);
    }
    
    // 9. 最终统计信息
    const finalStats = gostAuthService.getAuthStats();
    console.log('\n📊 最终缓存统计:');
    console.log(`   端口映射缓存: ${finalStats.portMappingCacheSize} 条`);
    console.log(`   用户数据缓存: ${finalStats.userDataCacheSize} 条`);
    console.log(`   认证结果缓存: ${finalStats.authResultCacheSize} 条`);
    console.log(`   缓存命中率: ${finalStats.cacheHitRate}`);
    console.log(`   数据库查询次数: ${finalStats.dbQueries}`);
    console.log(`   平均响应时间: ${finalStats.avgResponseTime}`);
    
    // 10. 生产环境建议
    console.log('\n💡 生产环境性能预期');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (cacheHitResults.length > 0) {
      const cacheAvg = analyzeResults(cacheHitResults).avg;
      console.log(`🎯 当前优化后延迟: ${formatTime(cacheAvg)}`);
      console.log(`🚀 生产环境预期延迟: ${formatTime(cacheAvg * 0.7)} (更高缓存命中率)`);
      console.log(`📈 建议缓存命中率: > 98%`);
      console.log(`⚡ TCP连接建立影响: +${formatTime(cacheAvg)} (仅连接建立时)`);
      
      if (cacheAvg < 1) {
        console.log(`✅ 性能评级: 优秀 - 对TCP转发影响极小`);
      } else if (cacheAvg < 2) {
        console.log(`✅ 性能评级: 良好 - 对TCP转发影响很小`);
      } else if (cacheAvg < 3) {
        console.log(`⚠️ 性能评级: 一般 - 建议进一步优化`);
      } else {
        console.log(`❌ 性能评级: 需要优化 - 影响较大`);
      }
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

// 运行测试
if (require.main === module) {
  runCacheOptimizationTest();
}

module.exports = { runCacheOptimizationTest };
