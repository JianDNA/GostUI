/**
 * GOST认证器性能测试
 * 测试认证器在不同场景下的延迟表现
 */

const axios = require('axios');

// 测试配置
const TEST_CONFIG = {
  baseUrl: 'http://localhost:3000',
  testRounds: 100,
  concurrentRequests: 10
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
    p95: sorted[Math.floor(len * 0.95)],
    p99: sorted[Math.floor(len * 0.99)]
  };
}

// 模拟GOST认证请求
async function simulateAuthRequest(port = 6443, cached = false) {
  const authData = {
    service: `forward-tcp-${port}`,
    network: 'tcp',
    addr: `127.0.0.1:${port}`,
    src: '127.0.0.1:12345'
  };

  const startTime = process.hrtime.bigint();
  
  try {
    const response = await axios.post(
      `${TEST_CONFIG.baseUrl}/api/gost-plugin/auth`,
      authData,
      {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // 转换为毫秒
    
    return {
      success: response.status === 200,
      duration,
      cached: response.data?.cached || false,
      result: response.data
    };
  } catch (error) {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000;
    
    return {
      success: false,
      duration,
      error: error.message
    };
  }
}

// 测试缓存性能
async function testCachePerformance() {
  console.log('🔥 测试认证缓存性能...\n');
  
  const port = 6443;
  const results = {
    firstRequest: [],
    cachedRequests: []
  };
  
  // 测试首次请求（缓存未命中）
  console.log('📊 测试首次认证请求（缓存未命中）...');
  for (let i = 0; i < 10; i++) {
    // 使用不同端口确保缓存未命中
    const testPort = 6443 + i;
    const result = await simulateAuthRequest(testPort);
    if (result.success) {
      results.firstRequest.push(result.duration);
      console.log(`   第${i+1}次: ${formatTime(result.duration)}`);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // 等待缓存生效
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // 测试缓存命中请求
  console.log('\n📊 测试缓存命中请求...');
  for (let i = 0; i < 20; i++) {
    const result = await simulateAuthRequest(port);
    if (result.success) {
      results.cachedRequests.push(result.duration);
      console.log(`   第${i+1}次: ${formatTime(result.duration)}`);
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  return results;
}

// 测试并发性能
async function testConcurrentPerformance() {
  console.log('🚀 测试并发认证性能...\n');
  
  const concurrentResults = [];
  const promises = [];
  
  console.log(`📊 发起 ${TEST_CONFIG.concurrentRequests} 个并发认证请求...`);
  
  for (let i = 0; i < TEST_CONFIG.concurrentRequests; i++) {
    const promise = simulateAuthRequest(6443).then(result => {
      if (result.success) {
        concurrentResults.push(result.duration);
        console.log(`   并发请求${i+1}: ${formatTime(result.duration)}`);
      }
      return result;
    });
    promises.push(promise);
  }
  
  const startTime = Date.now();
  await Promise.all(promises);
  const totalTime = Date.now() - startTime;
  
  console.log(`\n⏱️  总耗时: ${totalTime}ms`);
  console.log(`📈 平均QPS: ${(TEST_CONFIG.concurrentRequests / totalTime * 1000).toFixed(2)}`);
  
  return concurrentResults;
}

// 测试缓存优化效果
async function testCacheOptimization() {
  console.log('🚀 测试缓存优化效果...\n');

  // 获取优化前的统计信息
  const beforeStats = await getAuthStats();
  console.log('📊 优化前统计:', beforeStats);

  // 强制刷新缓存
  await forceRefreshCache();

  // 测试预热后的性能
  const preloadResults = [];
  console.log('📊 测试预热后的认证性能...');
  for (let i = 0; i < 20; i++) {
    const result = await simulateAuthRequest(6443);
    if (result.success) {
      preloadResults.push(result.duration);
      console.log(`   预热测试${i+1}: ${formatTime(result.duration)}`);
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // 获取优化后的统计信息
  const afterStats = await getAuthStats();
  console.log('\n📊 优化后统计:', afterStats);

  return { beforeStats, afterStats, preloadResults };
}

// 获取认证器统计信息
async function getAuthStats() {
  try {
    const response = await axios.get(`${TEST_CONFIG.baseUrl}/api/gost-plugin/status`);
    return response.data?.auth || {};
  } catch (error) {
    console.warn('⚠️ 无法获取认证器统计信息:', error.message);
    return {};
  }
}

// 强制刷新缓存
async function forceRefreshCache() {
  try {
    const response = await axios.post(`${TEST_CONFIG.baseUrl}/api/gost-plugin/clear-auth-cache`);
    console.log('🔄 缓存已清理:', response.data?.message || '成功');
  } catch (error) {
    console.warn('⚠️ 清理缓存失败:', error.message);
  }
}

// 主测试函数
async function runAuthPerformanceTest() {
  try {
    console.log('🔐 GOST认证器性能测试 (优化版)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 1. 测试缓存优化效果
    const optimizationResults = await testCacheOptimization();

    // 2. 测试缓存性能
    const cacheResults = await testCachePerformance();

    // 3. 测试并发性能
    const concurrentResults = await testConcurrentPerformance();
    
    // 4. 分析结果
    console.log('\n📈 性能分析结果');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 分析缓存优化效果
    if (optimizationResults.preloadResults.length > 0) {
      const preloadStats = analyzeResults(optimizationResults.preloadResults);
      console.log('🚀 缓存优化效果:');
      console.log(`   预热后平均延迟: ${formatTime(preloadStats.avg)}`);
      console.log(`   预热后P50延迟:  ${formatTime(preloadStats.p50)}`);
      console.log(`   预热后P95延迟:  ${formatTime(preloadStats.p95)}`);

      // 对比缓存命中率
      const beforeHitRate = optimizationResults.beforeStats.cacheHitRate || '0%';
      const afterHitRate = optimizationResults.afterStats.cacheHitRate || '0%';
      console.log(`   缓存命中率提升: ${beforeHitRate} → ${afterHitRate}`);
    }

    if (cacheResults.firstRequest.length > 0) {
      const firstStats = analyzeResults(cacheResults.firstRequest);
      console.log('\n🔍 首次认证（缓存未命中）:');
      console.log(`   平均延迟: ${formatTime(firstStats.avg)}`);
      console.log(`   P50延迟:  ${formatTime(firstStats.p50)}`);
      console.log(`   P95延迟:  ${formatTime(firstStats.p95)}`);
      console.log(`   最大延迟: ${formatTime(firstStats.max)}`);
    }

    if (cacheResults.cachedRequests.length > 0) {
      const cachedStats = analyzeResults(cacheResults.cachedRequests);
      console.log('\n⚡ 缓存命中认证:');
      console.log(`   平均延迟: ${formatTime(cachedStats.avg)}`);
      console.log(`   P50延迟:  ${formatTime(cachedStats.p50)}`);
      console.log(`   P95延迟:  ${formatTime(cachedStats.p95)}`);
      console.log(`   最大延迟: ${formatTime(cachedStats.max)}`);
    }

    if (concurrentResults.length > 0) {
      const concurrentStats = analyzeResults(concurrentResults);
      console.log('\n🚀 并发认证:');
      console.log(`   平均延迟: ${formatTime(concurrentStats.avg)}`);
      console.log(`   P50延迟:  ${formatTime(concurrentStats.p50)}`);
      console.log(`   P95延迟:  ${formatTime(concurrentStats.p95)}`);
      console.log(`   最大延迟: ${formatTime(concurrentStats.max)}`);
    }
    
    // 5. 性能建议和优化效果
    console.log('\n💡 性能建议和优化效果');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 分析优化效果
    if (optimizationResults.preloadResults.length > 0 && cacheResults.cachedRequests.length > 0) {
      const preloadAvg = analyzeResults(optimizationResults.preloadResults).avg;
      const cachedAvg = analyzeResults(cacheResults.cachedRequests).avg;
      const optimizationImprovement = cachedAvg > preloadAvg ?
        ((cachedAvg - preloadAvg) / cachedAvg * 100).toFixed(1) : 0;

      console.log('🚀 缓存优化成果:');
      console.log(`   优化前平均延迟: ${formatTime(cachedAvg)}`);
      console.log(`   优化后平均延迟: ${formatTime(preloadAvg)}`);
      if (optimizationImprovement > 0) {
        console.log(`   性能提升: ${optimizationImprovement}%`);
      }

      // 显示缓存统计
      const afterStats = optimizationResults.afterStats;
      if (afterStats.cacheHitRate) {
        console.log(`   当前缓存命中率: ${afterStats.cacheHitRate}`);
        console.log(`   缓存大小: 端口映射${afterStats.portMappingCacheSize || 0}, 用户数据${afterStats.userDataCacheSize || 0}`);
      }
    }

    if (cacheResults.firstRequest.length > 0 && cacheResults.cachedRequests.length > 0) {
      const firstAvg = analyzeResults(cacheResults.firstRequest).avg;
      const cachedAvg = analyzeResults(cacheResults.cachedRequests).avg;
      const improvement = ((firstAvg - cachedAvg) / firstAvg * 100).toFixed(1);

      console.log(`\n✅ 基础缓存效果: 延迟减少 ${improvement}%`);
      console.log(`📊 建议缓存命中率: > 95%`);

      if (firstAvg > 15) {
        console.log(`⚠️  首次认证延迟较高 (${formatTime(firstAvg)})，已通过多层缓存优化`);
      }

      if (cachedAvg > 3) {
        console.log(`⚠️  缓存命中延迟偏高 (${formatTime(cachedAvg)})，建议检查网络延迟`);
      } else {
        console.log(`✅ 缓存命中延迟良好 (${formatTime(cachedAvg)})`);
      }
    }

    console.log('\n🎯 TCP转发延迟影响评估:');
    const finalAvg = optimizationResults.preloadResults.length > 0 ?
      analyzeResults(optimizationResults.preloadResults).avg :
      (cacheResults.cachedRequests.length > 0 ? analyzeResults(cacheResults.cachedRequests).avg : 0);

    if (finalAvg > 0) {
      console.log(`   优化后认证延迟: ${formatTime(finalAvg)}`);
      console.log(`   影响程度: ${finalAvg < 1 ? '极小' : finalAvg < 2 ? '很小' : finalAvg < 3 ? '小' : '中等'}`);
      console.log(`   建议: ${finalAvg < 2 ? '性能优秀，无需进一步优化' : finalAvg < 3 ? '性能良好，可选择性优化' : '建议继续优化'}`);

      // 生产环境预期
      console.log('\n📊 生产环境性能预期:');
      console.log(`   预期缓存命中率: > 98% (端口映射很少变化)`);
      console.log(`   预期平均延迟: < ${formatTime(finalAvg * 0.8)} (更高缓存命中率)`);
      console.log(`   预期P95延迟: < ${formatTime(finalAvg * 1.2)}`);
    }
    
  } catch (error) {
    console.error('❌ 性能测试失败:', error.message);
  }
}

// 运行测试
if (require.main === module) {
  runAuthPerformanceTest();
}

module.exports = { runAuthPerformanceTest, simulateAuthRequest };
