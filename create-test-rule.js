#!/usr/bin/env node

/**
 * 创建测试转发规则
 */

const http = require('http');

async function createTestRule() {
  // 先登录获取token
  const loginData = JSON.stringify({
    username: 'admin',
    password: 'admin123'
  });

  const loginOptions = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginData)
    }
  };

  const token = await new Promise((resolve, reject) => {
    const req = http.request(loginOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response.token);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(loginData);
    req.end();
  });

  console.log('✅ 登录成功，获取到token');

  // 创建测试规则
  const ruleData = JSON.stringify({
    name: 'Traffic Test Rule',
    sourcePort: 28888,
    targetAddress: '127.0.0.1:8888',
    protocol: 'tcp',
    description: 'Test rule for traffic bug testing',
    listenAddressType: 'ipv4'
  });

  const ruleOptions = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/user-forward-rules',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Content-Length': Buffer.byteLength(ruleData)
    }
  };

  const result = await new Promise((resolve, reject) => {
    const req = http.request(ruleOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(ruleData);
    req.end();
  });

  console.log('✅ 测试规则创建结果:', result);
  return result;
}

if (require.main === module) {
  createTestRule().catch(console.error);
}

module.exports = createTestRule;
