#!/usr/bin/env node

/**
 * 精确的限制器测试
 * 测试实际的数据传输是否被限制
 */

const net = require('net');

console.log('🔍 精确限制器测试开始...\n');

// 测试函数：尝试通过6443端口发送数据
function testDataTransfer() {
  return new Promise((resolve) => {
    console.log('📡 尝试通过端口6443发送测试数据...');
    
    const client = new net.Socket();
    let dataReceived = false;
    let connectionEstablished = false;
    
    const timeout = setTimeout(() => {
      if (!connectionEstablished) {
        console.log('⏰ 连接超时 - 可能被限制器阻止');
        client.destroy();
        resolve({ success: false, reason: 'connection_timeout' });
      } else {
        console.log('⏰ 数据传输超时 - 连接建立但无数据传输');
        client.destroy();
        resolve({ success: false, reason: 'data_timeout' });
      }
    }, 10000);
    
    client.connect(6443, 'localhost', () => {
      connectionEstablished = true;
      console.log('✅ TCP连接已建立');
      
      // 发送测试数据
      const testData = 'GET / HTTP/1.1\r\nHost: localhost\r\n\r\n';
      console.log('📤 发送HTTP请求...');
      client.write(testData);
    });
    
    client.on('data', (data) => {
      dataReceived = true;
      clearTimeout(timeout);
      console.log('📥 收到响应数据:', data.toString().substring(0, 100) + '...');
      client.destroy();
      resolve({ success: true, reason: 'data_received', data: data.toString() });
    });
    
    client.on('error', (error) => {
      clearTimeout(timeout);
      console.log('❌ 连接错误:', error.message);
      resolve({ success: false, reason: 'connection_error', error: error.message });
    });
    
    client.on('close', () => {
      clearTimeout(timeout);
      if (!dataReceived && connectionEstablished) {
        console.log('🔒 连接被关闭，未收到数据 - 可能被限制器阻止');
        resolve({ success: false, reason: 'connection_closed_no_data' });
      }
    });
  });
}

// 测试函数：检查限制器API
async function testLimiterAPI() {
  console.log('🔧 测试限制器API...');
  
  try {
    const response = await fetch('http://localhost:3000/api/gost-plugin/limiter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        scope: 'client',
        service: 'forward-tcp-6443',
        network: 'tcp',
        addr: ':6443',
        client: 'user_2'
      })
    });
    
    const result = await response.json();
    console.log('📊 限制器API响应:', result);
    
    if (result.in === 0 && result.out === 0) {
      console.log('✅ 限制器正确返回阻止策略');
      return { blocked: true, result };
    } else {
      console.log('⚠️ 限制器允许通过');
      return { blocked: false, result };
    }
  } catch (error) {
    console.error('❌ 限制器API测试失败:', error.message);
    return { error: error.message };
  }
}

// 主测试函数
async function runTest() {
  console.log('🚀 开始精确限制器测试\n');
  console.log('='.repeat(50));
  
  // 1. 测试限制器API
  console.log('\n1️⃣ 测试限制器API响应');
  const limiterTest = await testLimiterAPI();
  
  // 2. 测试实际数据传输
  console.log('\n2️⃣ 测试实际数据传输');
  const dataTest = await testDataTransfer();
  
  // 3. 分析结果
  console.log('\n📋 测试结果分析');
  console.log('='.repeat(50));
  
  console.log('限制器API测试:', limiterTest.blocked ? '✅ 阻止' : '❌ 允许');
  console.log('数据传输测试:', dataTest.success ? '❌ 成功' : '✅ 失败');
  
  if (limiterTest.blocked && !dataTest.success) {
    console.log('\n🎉 结论: 限制器工作正常！');
    console.log('   - API正确返回阻止策略');
    console.log('   - 实际数据传输被阻止');
  } else if (limiterTest.blocked && dataTest.success) {
    console.log('\n🚨 问题确认: 限制器API工作但实际传输未被阻止');
    console.log('   - 可能的原因:');
    console.log('     1. GOST未正确应用限制器策略');
    console.log('     2. 限制器配置有问题');
    console.log('     3. 缓存问题导致策略未及时生效');
  } else if (!limiterTest.blocked) {
    console.log('\n🚨 问题确认: 限制器API未正确阻止用户');
    console.log('   - 可能的原因:');
    console.log('     1. 用户识别逻辑有问题');
    console.log('     2. 配额检查逻辑有问题');
    console.log('     3. 缓存数据不正确');
  }
  
  console.log('\n🎯 测试完成');
}

// 运行测试
runTest().catch(error => {
  console.error('❌ 测试失败:', error);
  process.exit(1);
});
