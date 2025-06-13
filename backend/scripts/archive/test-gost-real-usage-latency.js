/**
 * 🚀 GOST真实使用场景延迟测试
 * 
 * 模拟用户正常使用场景:
 * 1. 网页浏览 (HTTP请求)
 * 2. 文件下载 (大文件传输)
 * 3. API调用 (小数据包)
 * 4. 长连接保持
 * 5. 并发连接测试
 * 
 * 测试GOST认证器、限制器、观察器对实际使用的延迟影响
 */

const axios = require('axios');
const net = require('net');
const fs = require('fs');
const path = require('path');

// 测试配置
const TEST_CONFIG = {
  baseUrl: 'http://localhost:3000',
  gostPort: 6443,  // GOST转发端口
  targetPort: 3000, // 目标服务端口
  testDuration: 60000, // 1分钟测试
  concurrentConnections: 5,
  downloadSizes: [1024, 10240, 102400, 1048576], // 1KB, 10KB, 100KB, 1MB
};

// 格式化时间
function formatTime(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(1)}μs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// 格式化字节
function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)}${units[unitIndex]}`;
}

// 统计分析
function analyzeResults(results) {
  if (results.length === 0) return null;
  
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

// 测试HTTP请求延迟 (模拟网页浏览)
async function testHttpBrowsing() {
  console.log('🌐 测试HTTP网页浏览延迟...\n');
  
  const results = {
    direct: [],
    throughGost: [],
    errors: []
  };
  
  const testUrls = [
    '/api/health',
    '/api/test/latency',
    '/api/test/status',
    '/api/system/status'
  ];
  
  // 测试直连延迟
  console.log('📊 测试直连延迟...');
  for (let i = 0; i < 20; i++) {
    try {
      const url = testUrls[i % testUrls.length];
      const startTime = process.hrtime.bigint();
      
      await axios.get(`${TEST_CONFIG.baseUrl}${url}`, { timeout: 5000 });
      
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;
      results.direct.push(duration);
      
      if (i < 5) {
        console.log(`   直连请求${i+1}: ${formatTime(duration)}`);
      }
    } catch (error) {
      results.errors.push({ type: 'direct', error: error.message });
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // 测试通过GOST的延迟
  console.log('\n📊 测试通过GOST转发延迟...');
  for (let i = 0; i < 20; i++) {
    try {
      const url = testUrls[i % testUrls.length];
      const startTime = process.hrtime.bigint();
      
      await axios.get(`http://localhost:${TEST_CONFIG.gostPort}${url}`, { timeout: 5000 });
      
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;
      results.throughGost.push(duration);
      
      if (i < 5) {
        console.log(`   GOST请求${i+1}: ${formatTime(duration)}`);
      }
    } catch (error) {
      results.errors.push({ type: 'gost', error: error.message });
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return results;
}

// 测试TCP连接建立延迟
async function testTcpConnectionLatency() {
  console.log('🔌 测试TCP连接建立延迟...\n');
  
  const results = {
    direct: [],
    throughGost: [],
    errors: []
  };
  
  // 测试直连TCP连接
  console.log('📊 测试直连TCP连接...');
  for (let i = 0; i < 10; i++) {
    try {
      const startTime = process.hrtime.bigint();
      
      const socket = new net.Socket();
      await new Promise((resolve, reject) => {
        socket.connect(TEST_CONFIG.targetPort, 'localhost', () => {
          const endTime = process.hrtime.bigint();
          const duration = Number(endTime - startTime) / 1000000;
          results.direct.push(duration);
          socket.destroy();
          resolve();
        });
        
        socket.on('error', reject);
        setTimeout(() => reject(new Error('连接超时')), 5000);
      });
      
      if (i < 5) {
        console.log(`   直连TCP${i+1}: ${formatTime(results.direct[results.direct.length - 1])}`);
      }
    } catch (error) {
      results.errors.push({ type: 'direct_tcp', error: error.message });
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // 测试通过GOST的TCP连接
  console.log('\n📊 测试通过GOST的TCP连接...');
  for (let i = 0; i < 10; i++) {
    try {
      const startTime = process.hrtime.bigint();
      
      const socket = new net.Socket();
      await new Promise((resolve, reject) => {
        socket.connect(TEST_CONFIG.gostPort, 'localhost', () => {
          const endTime = process.hrtime.bigint();
          const duration = Number(endTime - startTime) / 1000000;
          results.throughGost.push(duration);
          socket.destroy();
          resolve();
        });
        
        socket.on('error', reject);
        setTimeout(() => reject(new Error('连接超时')), 5000);
      });
      
      if (i < 5) {
        console.log(`   GOST TCP${i+1}: ${formatTime(results.throughGost[results.throughGost.length - 1])}`);
      }
    } catch (error) {
      results.errors.push({ type: 'gost_tcp', error: error.message });
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  return results;
}

// 测试文件下载延迟 (模拟下载场景)
async function testDownloadLatency() {
  console.log('📥 测试文件下载延迟...\n');
  
  const results = {
    direct: {},
    throughGost: {},
    errors: []
  };
  
  for (const size of TEST_CONFIG.downloadSizes) {
    console.log(`📊 测试 ${formatBytes(size)} 文件下载...`);
    
    results.direct[size] = [];
    results.throughGost[size] = [];
    
    // 创建测试数据
    const testData = Buffer.alloc(size, 'A');
    
    // 测试直连下载
    for (let i = 0; i < 3; i++) {
      try {
        const startTime = process.hrtime.bigint();
        
        // 模拟下载：发送数据并接收响应
        const response = await axios.post(`${TEST_CONFIG.baseUrl}/api/test/echo`, {
          data: testData.toString('base64')
        }, {
          timeout: 10000,
          maxContentLength: size * 2
        });
        
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000;
        results.direct[size].push(duration);
        
        console.log(`   直连下载${i+1}: ${formatTime(duration)}`);
      } catch (error) {
        results.errors.push({ type: 'direct_download', size, error: error.message });
      }
    }
    
    // 测试通过GOST下载
    for (let i = 0; i < 3; i++) {
      try {
        const startTime = process.hrtime.bigint();
        
        const response = await axios.post(`http://localhost:${TEST_CONFIG.gostPort}/api/test/echo`, {
          data: testData.toString('base64')
        }, {
          timeout: 10000,
          maxContentLength: size * 2
        });
        
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000;
        results.throughGost[size].push(duration);
        
        console.log(`   GOST下载${i+1}: ${formatTime(duration)}`);
      } catch (error) {
        results.errors.push({ type: 'gost_download', size, error: error.message });
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return results;
}

// 测试并发连接延迟
async function testConcurrentLatency() {
  console.log('🔀 测试并发连接延迟...\n');
  
  const results = {
    direct: [],
    throughGost: [],
    errors: []
  };
  
  // 测试直连并发
  console.log('📊 测试直连并发请求...');
  const directPromises = [];
  const directStartTime = Date.now();
  
  for (let i = 0; i < TEST_CONFIG.concurrentConnections; i++) {
    const promise = (async () => {
      const startTime = process.hrtime.bigint();
      try {
        await axios.get(`${TEST_CONFIG.baseUrl}/api/test/latency`, { timeout: 5000 });
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000;
        results.direct.push(duration);
        return duration;
      } catch (error) {
        results.errors.push({ type: 'concurrent_direct', error: error.message });
        return null;
      }
    })();
    directPromises.push(promise);
  }
  
  const directResults = await Promise.all(directPromises);
  const directTotalTime = Date.now() - directStartTime;
  
  console.log(`   直连并发完成，总耗时: ${directTotalTime}ms`);
  
  // 测试GOST并发
  console.log('\n📊 测试GOST并发请求...');
  const gostPromises = [];
  const gostStartTime = Date.now();
  
  for (let i = 0; i < TEST_CONFIG.concurrentConnections; i++) {
    const promise = (async () => {
      const startTime = process.hrtime.bigint();
      try {
        await axios.get(`http://localhost:${TEST_CONFIG.gostPort}/api/test/latency`, { timeout: 5000 });
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000;
        results.throughGost.push(duration);
        return duration;
      } catch (error) {
        results.errors.push({ type: 'concurrent_gost', error: error.message });
        return null;
      }
    })();
    gostPromises.push(promise);
  }
  
  const gostResults = await Promise.all(gostPromises);
  const gostTotalTime = Date.now() - gostStartTime;
  
  console.log(`   GOST并发完成，总耗时: ${gostTotalTime}ms`);
  
  return {
    ...results,
    directTotalTime,
    gostTotalTime
  };
}

// 主测试函数
async function runGostRealUsageLatencyTest() {
  try {
    console.log('🚀 GOST真实使用场景延迟测试');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // 1. HTTP浏览测试
    const httpResults = await testHttpBrowsing();
    
    // 2. TCP连接测试
    const tcpResults = await testTcpConnectionLatency();
    
    // 3. 文件下载测试
    const downloadResults = await testDownloadLatency();
    
    // 4. 并发连接测试
    const concurrentResults = await testConcurrentLatency();
    
    // 5. 生成详细报告
    console.log('\n📈 详细性能报告');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // HTTP浏览延迟分析
    if (httpResults.direct.length > 0 && httpResults.throughGost.length > 0) {
      const directStats = analyzeResults(httpResults.direct);
      const gostStats = analyzeResults(httpResults.throughGost);
      const overhead = gostStats.avg - directStats.avg;
      const overheadPercent = (overhead / directStats.avg * 100).toFixed(1);
      
      console.log('🌐 HTTP网页浏览延迟:');
      console.log(`   直连平均: ${formatTime(directStats.avg)} (P95: ${formatTime(directStats.p95)})`);
      console.log(`   GOST平均: ${formatTime(gostStats.avg)} (P95: ${formatTime(gostStats.p95)})`);
      console.log(`   延迟开销: +${formatTime(overhead)} (+${overheadPercent}%)`);
    }
    
    // TCP连接延迟分析
    if (tcpResults.direct.length > 0 && tcpResults.throughGost.length > 0) {
      const directStats = analyzeResults(tcpResults.direct);
      const gostStats = analyzeResults(tcpResults.throughGost);
      const overhead = gostStats.avg - directStats.avg;
      const overheadPercent = (overhead / directStats.avg * 100).toFixed(1);
      
      console.log('\n🔌 TCP连接建立延迟:');
      console.log(`   直连平均: ${formatTime(directStats.avg)} (P95: ${formatTime(directStats.p95)})`);
      console.log(`   GOST平均: ${formatTime(gostStats.avg)} (P95: ${formatTime(gostStats.p95)})`);
      console.log(`   延迟开销: +${formatTime(overhead)} (+${overheadPercent}%)`);
    }
    
    // 文件下载延迟分析
    console.log('\n📥 文件下载延迟:');
    for (const size of TEST_CONFIG.downloadSizes) {
      if (downloadResults.direct[size]?.length > 0 && downloadResults.throughGost[size]?.length > 0) {
        const directStats = analyzeResults(downloadResults.direct[size]);
        const gostStats = analyzeResults(downloadResults.throughGost[size]);
        const overhead = gostStats.avg - directStats.avg;
        const overheadPercent = (overhead / directStats.avg * 100).toFixed(1);
        
        console.log(`   ${formatBytes(size)}:`);
        console.log(`     直连: ${formatTime(directStats.avg)}`);
        console.log(`     GOST: ${formatTime(gostStats.avg)} (+${formatTime(overhead)}, +${overheadPercent}%)`);
      }
    }
    
    // 并发连接分析
    if (concurrentResults.direct.length > 0 && concurrentResults.throughGost.length > 0) {
      const directStats = analyzeResults(concurrentResults.direct);
      const gostStats = analyzeResults(concurrentResults.throughGost);
      const overhead = gostStats.avg - directStats.avg;
      
      console.log('\n🔀 并发连接延迟:');
      console.log(`   直连平均: ${formatTime(directStats.avg)}`);
      console.log(`   GOST平均: ${formatTime(gostStats.avg)}`);
      console.log(`   延迟开销: +${formatTime(overhead)}`);
      console.log(`   并发处理: 直连${concurrentResults.directTotalTime}ms vs GOST${concurrentResults.gostTotalTime}ms`);
    }
    
    // 总体评估
    console.log('\n🎯 总体性能评估');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const allOverheads = [];
    
    // 收集所有延迟开销数据
    if (httpResults.direct.length > 0 && httpResults.throughGost.length > 0) {
      const directAvg = analyzeResults(httpResults.direct).avg;
      const gostAvg = analyzeResults(httpResults.throughGost).avg;
      allOverheads.push(gostAvg - directAvg);
    }
    
    if (tcpResults.direct.length > 0 && tcpResults.throughGost.length > 0) {
      const directAvg = analyzeResults(tcpResults.direct).avg;
      const gostAvg = analyzeResults(tcpResults.throughGost).avg;
      allOverheads.push(gostAvg - directAvg);
    }
    
    if (allOverheads.length > 0) {
      const avgOverhead = allOverheads.reduce((a, b) => a + b, 0) / allOverheads.length;
      console.log(`平均延迟开销: ${formatTime(avgOverhead)}`);
      
      if (avgOverhead < 1) {
        console.log('🏆 评级: 优秀 - 延迟开销极小，用户无感知');
      } else if (avgOverhead < 5) {
        console.log('👍 评级: 良好 - 延迟开销很小，对用户体验影响微小');
      } else if (avgOverhead < 10) {
        console.log('⚠️ 评级: 一般 - 延迟开销较小，可接受范围');
      } else {
        console.log('❌ 评级: 需要优化 - 延迟开销较大，影响用户体验');
      }
    }
    
    // 错误统计
    const totalErrors = httpResults.errors.length + tcpResults.errors.length + 
                       downloadResults.errors.length + concurrentResults.errors.length;
    
    console.log(`\n📊 测试统计:`);
    console.log(`   总错误数: ${totalErrors}`);
    console.log(`   HTTP测试: ${httpResults.direct.length + httpResults.throughGost.length} 次请求`);
    console.log(`   TCP测试: ${tcpResults.direct.length + tcpResults.throughGost.length} 次连接`);
    console.log(`   下载测试: ${Object.values(downloadResults.direct).flat().length + Object.values(downloadResults.throughGost).flat().length} 次传输`);
    console.log(`   并发测试: ${concurrentResults.direct.length + concurrentResults.throughGost.length} 次请求`);
    
  } catch (error) {
    console.error('❌ GOST延迟测试失败:', error);
  }
}

// 运行测试
if (require.main === module) {
  runGostRealUsageLatencyTest();
}

module.exports = { runGostRealUsageLatencyTest };
