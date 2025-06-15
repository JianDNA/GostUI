#!/usr/bin/env node

const http = require('http');

async function restartGost() {
  try {
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

    console.log('🔑 获取认证token成功');

    // 重启GOST
    const restartOptions = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/gost/restart',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    const result = await new Promise((resolve, reject) => {
      const req = http.request(restartOptions, (res) => {
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
      req.end();
    });

    console.log('🔄 GOST重启结果:', result.success ? '成功' : '失败');
    
    if (result.success) {
      console.log('✅ GOST已重启，流量统计修复已生效');
      console.log('⏰ 等待服务稳定...');
      
      // 等待10秒让服务稳定
      await new Promise(resolve => setTimeout(resolve, 10000));
      console.log('✅ 服务已稳定，可以开始测试');
    }

  } catch (error) {
    console.error('❌ 重启GOST失败:', error);
  }
}

if (require.main === module) {
  restartGost().catch(console.error);
}

module.exports = restartGost;
