#!/usr/bin/env node

/**
 * 更新观察器周期配置
 */

const fs = require('fs');
const path = require('path');

async function updateObserverPeriod() {
  const configPath = path.join(__dirname, 'backend/config/gost-config.json');
  
  try {
    // 读取当前配置
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    console.log('📖 读取当前配置成功');
    
    // 更新观察器周期为10秒
    const newPeriod = "10s";
    
    // 更新所有服务的观察器周期
    if (config.services) {
      config.services.forEach(service => {
        if (service.handler && service.handler.metadata) {
          service.handler.metadata["observer.period"] = newPeriod;
        }
        if (service.metadata) {
          service.metadata["observer.period"] = newPeriod;
        }
      });
    }
    
    console.log(`✅ 已更新所有服务的观察器周期为 ${newPeriod}`);
    
    // 写回配置文件
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('💾 配置文件已保存');
    
    // 触发GOST热重载
    const http = require('http');
    
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

    // 触发GOST重启
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

    const restartResult = await new Promise((resolve, reject) => {
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

    console.log('🔄 GOST重启结果:', restartResult);
    
    if (restartResult.success) {
      console.log('✅ 观察器周期更新完成，GOST已重启');
      console.log('⏰ 新的统计周期：10秒');
    } else {
      console.log('⚠️ GOST重启可能失败，请手动检查');
    }
    
  } catch (error) {
    console.error('❌ 更新观察器周期失败:', error);
  }
}

if (require.main === module) {
  updateObserverPeriod().catch(console.error);
}

module.exports = updateObserverPeriod;
