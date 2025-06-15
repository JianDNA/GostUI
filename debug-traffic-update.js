#!/usr/bin/env node

/**
 * 调试流量更新问题
 */

const http = require('http');

// 模拟观察器数据发送
async function sendMockObserverData() {
  const mockData = {
    events: [
      {
        kind: "service",
        service: "forward-tcp-28888",
        type: "stats",
        stats: {
          totalConns: 1,
          currentConns: 0,
          inputBytes: 59,
          outputBytes: 1048716,
          totalErrs: 0
        }
      }
    ]
  };

  const postData = JSON.stringify(mockData);

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/gost-plugin/observer',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: response });
        } catch (error) {
          resolve({ statusCode: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// 获取认证token
async function getAuthToken() {
  const loginData = JSON.stringify({
    username: 'admin',
    password: 'admin123'
  });

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginData)
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
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
}

// 获取用户流量
async function getUserTraffic() {
  try {
    const token = await getAuthToken();

    return new Promise((resolve) => {
      const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/users/1',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            resolve(response.data?.usedTraffic || 0);
          } catch (error) {
            console.error('解析用户数据失败:', error);
            resolve(0);
          }
        });
      });

      req.on('error', (error) => {
        console.error('获取用户流量失败:', error);
        resolve(0);
      });
      req.end();
    });
  } catch (error) {
    console.error('获取认证token失败:', error);
    return 0;
  }
}

async function debugTrafficUpdate() {
  console.log('🔍 开始调试流量更新问题...');

  // 1. 获取初始流量
  const initialTraffic = await getUserTraffic();
  console.log(`📊 初始用户流量: ${(initialTraffic / 1024 / 1024).toFixed(2)}MB`);

  // 2. 发送模拟观察器数据
  console.log('📤 发送模拟观察器数据...');
  try {
    const result = await sendMockObserverData();
    console.log(`✅ 观察器响应: ${result.statusCode}`, result.data);
  } catch (error) {
    console.error('❌ 发送观察器数据失败:', error);
    return;
  }

  // 3. 等待处理
  console.log('⏰ 等待数据处理...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 4. 检查流量更新
  const updatedTraffic = await getUserTraffic();
  console.log(`📊 更新后用户流量: ${(updatedTraffic / 1024 / 1024).toFixed(2)}MB`);

  const increment = updatedTraffic - initialTraffic;
  console.log(`📈 流量增量: ${(increment / 1024).toFixed(1)}KB`);

  if (increment > 0) {
    console.log('✅ 流量统计更新成功!');
  } else {
    console.log('❌ 流量统计没有更新，需要进一步调试');
    
    // 检查后端日志
    console.log('🔍 建议检查后端控制台输出，查看观察器处理日志');
  }
}

if (require.main === module) {
  debugTrafficUpdate().catch(console.error);
}

module.exports = debugTrafficUpdate;
