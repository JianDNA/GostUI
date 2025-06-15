#!/usr/bin/env node

const http = require('http');

async function checkTraffic() {
  // 登录获取token
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

  // 获取用户流量
  const userOptions = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/users/1',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  const userTraffic = await new Promise((resolve, reject) => {
    const req = http.request(userOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          console.log('用户API响应:', JSON.stringify(response, null, 2));
          resolve(response.data?.usedTraffic || 0);
        } catch (error) {
          console.error('解析用户数据失败:', error);
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });

  console.log(`当前用户流量: ${(userTraffic / 1024 / 1024).toFixed(2)}MB (${userTraffic} 字节)`);

  // 获取规则流量
  const rulesOptions = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/user-forward-rules',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  const rules = await new Promise((resolve, reject) => {
    const req = http.request(rulesOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response.groupedRules[0].rules);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });

  console.log('\n规则流量统计:');
  rules.forEach(rule => {
    console.log(`- ${rule.name} (端口${rule.sourcePort}): ${(rule.usedTraffic / 1024 / 1024).toFixed(2)}MB`);
  });
}

if (require.main === module) {
  checkTraffic().catch(console.error);
}

module.exports = checkTraffic;
