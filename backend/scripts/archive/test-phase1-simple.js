/**
 * Phase 1 简化测试 - 逐步验证插件功能
 */

const http = require('http');

function makeHttpRequest(method, url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout: 5000
    };

    const req = http.request(options, (res) => {
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

async function testStep(stepName, testFunction) {
  console.log(`\n🧪 ${stepName}...`);
  try {
    await testFunction();
    console.log(`✅ ${stepName} 成功`);
  } catch (error) {
    console.log(`❌ ${stepName} 失败:`, error.message);
  }
}

async function simplePhase1Test() {
  console.log('🧪 Phase 1 简化测试开始...\n');

  // 1. 测试基本连接
  await testStep('测试后端连接', async () => {
    const response = await makeHttpRequest('GET', 'http://localhost:3000/api/health');
    if (response.statusCode !== 200) {
      throw new Error(`健康检查失败: ${response.statusCode}`);
    }
  });

  // 2. 测试插件状态接口
  await testStep('测试插件状态接口', async () => {
    const response = await makeHttpRequest('GET', 'http://localhost:3000/api/gost-plugin/status');
    if (response.statusCode !== 200) {
      throw new Error(`状态接口失败: ${response.statusCode}`);
    }
    console.log('   状态数据:', JSON.stringify(response.data, null, 2));
  });

  // 3. 测试认证器接口
  await testStep('测试认证器接口', async () => {
    const testData = {
      service: 'forward-tcp-6443',
      network: 'tcp',
      addr: 'test.com:443',
      src: '127.0.0.1:12345'
    };
    
    const response = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/auth', testData);
    if (response.statusCode !== 200) {
      throw new Error(`认证接口失败: ${response.statusCode}`);
    }
    console.log('   认证响应:', response.data);
  });

  // 4. 测试限制器接口
  await testStep('测试限制器接口', async () => {
    const testData = {
      scope: 'client',
      service: 'forward-tcp-6443',
      network: 'tcp',
      addr: 'test.com:443',
      client: 'user_1',
      src: '127.0.0.1:12345'
    };
    
    const response = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/limiter', testData);
    if (response.statusCode !== 200) {
      throw new Error(`限制器接口失败: ${response.statusCode}`);
    }
    console.log('   限制器响应:', response.data);
  });

  // 5. 测试观察器接口
  await testStep('测试观察器接口', async () => {
    const testData = {
      events: [
        {
          kind: "service",
          service: "forward-tcp-6443",
          type: "stats",
          stats: {
            totalConns: 1,
            currentConns: 1,
            inputBytes: 1024,
            outputBytes: 2048,
            totalErrs: 0
          }
        }
      ]
    };
    
    const response = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', testData);
    if (response.statusCode !== 200) {
      throw new Error(`观察器接口失败: ${response.statusCode}`);
    }
    console.log('   观察器响应:', response.data);
  });

  // 6. 测试缓存清理
  await testStep('测试缓存清理', async () => {
    const response = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/clear-limiter-cache', {});
    if (response.statusCode !== 200) {
      throw new Error(`缓存清理失败: ${response.statusCode}`);
    }
    console.log('   清理响应:', response.data);
  });

  console.log('\n🎉 Phase 1 简化测试完成！');
  console.log('\n📋 如果所有测试都成功，说明Phase 1基础功能正常！');
}

simplePhase1Test().catch(error => {
  console.error('\n❌ 测试过程中发生未捕获的错误:', error);
});
