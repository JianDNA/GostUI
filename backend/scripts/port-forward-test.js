/**
 * 端口转发测试脚本
 */

const http = require('http');

function testPortForward(port = 6443) {
  return new Promise((resolve, reject) => {
    console.log(`🧪 测试端口 ${port} 转发...`);
    
    const options = {
      hostname: 'localhost',
      port: port,
      path: '/api/test-forward',
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          console.log(`✅ 端口 ${port} 转发测试成功:`, response.message);
          resolve(response);
        } catch (error) {
          console.log(`✅ 端口 ${port} 转发测试成功 (非JSON响应):`, data);
          resolve({ status: 'ok', data });
        }
      });
    });

    req.on('error', (error) => {
      console.error(`❌ 端口 ${port} 转发测试失败:`, error.message);
      reject(error);
    });

    req.on('timeout', () => {
      console.error(`❌ 端口 ${port} 转发测试超时`);
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function runTests() {
  console.log('🚀 开始端口转发测试...\n');
  
  const ports = [6443, 8080, 2999];
  
  for (const port of ports) {
    try {
      await testPortForward(port);
    } catch (error) {
      console.error(`端口 ${port} 测试失败:`, error.message);
    }
    console.log('');
  }
  
  console.log('✅ 端口转发测试完成');
}

if (require.main === module) {
  runTests();
}

module.exports = { testPortForward, runTests };
