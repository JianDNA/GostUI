#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');

async function restoreConfig() {
  try {
    const configPath = path.join(__dirname, 'backend/config/gost-config.json');
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);

    // 恢复观察器地址
    if (config.observers && config.observers[0]) {
      config.observers[0].plugin.addr = 'http://localhost:3000/api/gost-plugin/observer';
      console.log('🔄 恢复观察器地址为原始地址');
    }

    // 写回配置文件
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('💾 原始配置已恢复');

    // 重启GOST
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

  } catch (error) {
    console.error('❌ 恢复原始配置失败:', error);
  }
}

if (require.main === module) {
  restoreConfig().catch(console.error);
}

module.exports = restoreConfig;
