/**
 * 最终限制器测试 - 验证GOST限制器是否真正阻止超配额用户
 */

const net = require('net');

async function testConnection(port, description) {
  return new Promise((resolve) => {
    console.log(`\n🔍 测试 ${description} (端口 ${port})...`);
    
    const client = new net.Socket();
    const startTime = Date.now();
    let connected = false;
    let dataReceived = false;
    
    // 设置超时
    const timeout = setTimeout(() => {
      if (!connected) {
        console.log(`⏰ 连接超时 (${port})`);
        client.destroy();
        resolve({ success: false, reason: 'timeout', duration: Date.now() - startTime });
      }
    }, 5000);
    
    client.on('connect', () => {
      connected = true;
      console.log(`✅ 连接成功 (${port})`);
      
      // 尝试发送数据
      client.write('GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
    });
    
    client.on('data', (data) => {
      dataReceived = true;
      console.log(`📊 收到数据 (${port}): ${data.length} 字节`);
      console.log(`📝 数据内容: ${data.toString().substring(0, 100)}...`);
      
      // 收到数据后关闭连接
      setTimeout(() => {
        client.destroy();
        clearTimeout(timeout);
        resolve({ 
          success: true, 
          dataReceived: true, 
          dataSize: data.length,
          duration: Date.now() - startTime 
        });
      }, 100);
    });
    
    client.on('error', (err) => {
      console.log(`❌ 连接错误 (${port}): ${err.message}`);
      clearTimeout(timeout);
      resolve({ success: false, reason: err.message, duration: Date.now() - startTime });
    });
    
    client.on('close', () => {
      if (!dataReceived && connected) {
        console.log(`🔒 连接被关闭，无数据传输 (${port})`);
        clearTimeout(timeout);
        resolve({ 
          success: true, 
          dataReceived: false, 
          duration: Date.now() - startTime 
        });
      }
    });
    
    // 连接到端口
    client.connect(port, 'localhost');
  });
}

async function testLimiter() {
  console.log('🚀 开始最终限制器测试...\n');
  
  // 等待服务启动
  console.log('⏳ 等待服务启动...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const tests = [
    { port: 2999, description: 'test用户端口 2999 (超配额)' },
    { port: 6443, description: 'test用户端口 6443 (超配额)' },
    { port: 9080, description: 'admin用户端口 9080 (正常配额)' }
  ];
  
  const results = [];
  
  for (const test of tests) {
    const result = await testConnection(test.port, test.description);
    results.push({ ...test, ...result });
    
    // 测试间隔
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n📊 测试结果汇总:');
  console.log('=' * 50);
  
  for (const result of results) {
    console.log(`\n🔍 ${result.description}:`);
    console.log(`   连接状态: ${result.success ? '✅ 成功' : '❌ 失败'}`);
    console.log(`   数据传输: ${result.dataReceived ? '✅ 有数据' : '❌ 无数据'}`);
    console.log(`   持续时间: ${result.duration}ms`);
    if (result.dataSize) {
      console.log(`   数据大小: ${result.dataSize} 字节`);
    }
    if (result.reason) {
      console.log(`   失败原因: ${result.reason}`);
    }
  }
  
  console.log('\n🎯 分析结论:');
  
  const testUserResults = results.filter(r => r.port === 2999 || r.port === 6443);
  const adminUserResults = results.filter(r => r.port === 9080);
  
  const testUserBlocked = testUserResults.every(r => !r.dataReceived);
  const adminUserWorking = adminUserResults.every(r => r.success);
  
  if (testUserBlocked && adminUserWorking) {
    console.log('✅ 限制器工作正常！');
    console.log('   - test用户 (超配额) 被成功阻止');
    console.log('   - admin用户 (正常配额) 可以正常使用');
  } else if (testUserBlocked) {
    console.log('⚠️ 限制器部分工作');
    console.log('   - test用户被阻止 ✅');
    console.log('   - admin用户可能有问题 ❌');
  } else {
    console.log('❌ 限制器未生效！');
    console.log('   - test用户仍可传输数据');
    console.log('   - 需要检查限制器配置');
  }
  
  console.log('\n🔧 建议下一步:');
  if (!testUserBlocked) {
    console.log('1. 检查GOST限制器插件配置');
    console.log('2. 验证限制器scope设置');
    console.log('3. 检查认证器返回的用户标识');
    console.log('4. 考虑使用配额强制执行服务');
  } else {
    console.log('1. 限制器工作正常，可以投入使用');
    console.log('2. 监控配额强制执行服务的运行状态');
  }
}

// 运行测试
testLimiter().catch(console.error);
