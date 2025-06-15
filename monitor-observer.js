#!/usr/bin/env node

/**
 * 监控观察器数据接收
 */

const express = require('express');
const http = require('http');

class ObserverMonitor {
  constructor() {
    this.app = express();
    this.port = 18082; // 使用不同的端口避免冲突
    this.receivedEvents = [];
    this.setupRoutes();
  }

  setupRoutes() {
    this.app.use(express.json());

    // 模拟观察器端点
    this.app.post('/observer', (req, res) => {
      const timestamp = new Date().toISOString();
      console.log(`🔍 [${timestamp}] 观察器收到数据:`);
      console.log(JSON.stringify(req.body, null, 2));
      
      // 记录事件
      this.receivedEvents.push({
        timestamp,
        data: req.body
      });

      // 分析事件
      if (req.body.events && Array.isArray(req.body.events)) {
        req.body.events.forEach((event, index) => {
          console.log(`📊 事件 ${index + 1}:`);
          console.log(`   类型: ${event.type}`);
          console.log(`   服务: ${event.service || 'N/A'}`);
          console.log(`   种类: ${event.kind || 'N/A'}`);
          
          if (event.stats) {
            console.log(`   统计: 输入=${event.stats.inputBytes || 0}, 输出=${event.stats.outputBytes || 0}`);
          }
        });
      }

      res.json({ ok: true });
    });

    // 健康检查
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        eventsReceived: this.receivedEvents.length,
        lastEvent: this.receivedEvents.length > 0 ? this.receivedEvents[this.receivedEvents.length - 1].timestamp : null
      });
    });

    // 获取统计信息
    this.app.get('/stats', (req, res) => {
      res.json({
        totalEvents: this.receivedEvents.length,
        events: this.receivedEvents.slice(-10) // 最近10个事件
      });
    });
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, 'localhost', (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`✅ 观察器监控器启动在端口 ${this.port}`);
          resolve();
        }
      });
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log('🔚 观察器监控器已停止');
          resolve();
        });
      });
    }
  }

  // 更新GOST配置指向我们的监控器
  async updateGostObserverConfig() {
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

      // 读取当前配置
      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(__dirname, 'backend/config/gost-config.json');
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configContent);

      // 更新观察器地址
      if (config.observers && config.observers[0]) {
        config.observers[0].plugin.addr = `http://localhost:${this.port}/observer`;
        console.log(`🔄 更新观察器地址为: http://localhost:${this.port}/observer`);
      }

      // 写回配置文件
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log('💾 配置文件已更新');

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

      console.log('🔄 GOST重启结果:', restartResult.success ? '成功' : '失败');
      
      if (restartResult.success) {
        console.log('✅ GOST配置已更新，观察器现在指向监控器');
        console.log('⏰ 等待观察器数据...');
      }

    } catch (error) {
      console.error('❌ 更新GOST观察器配置失败:', error);
    }
  }

  // 恢复原始配置
  async restoreOriginalConfig() {
    try {
      const fs = require('fs');
      const path = require('path');
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

    } catch (error) {
      console.error('❌ 恢复原始配置失败:', error);
    }
  }
}

async function main() {
  const monitor = new ObserverMonitor();
  
  try {
    await monitor.start();
    await monitor.updateGostObserverConfig();
    
    console.log('\n📊 监控器已启动，等待观察器数据...');
    console.log('按 Ctrl+C 停止监控');
    
    // 设置优雅退出
    process.on('SIGINT', async () => {
      console.log('\n🔄 正在停止监控器...');
      await monitor.restoreOriginalConfig();
      await monitor.stop();
      process.exit(0);
    });
    
    // 每30秒显示统计信息
    setInterval(() => {
      console.log(`📈 统计: 已接收 ${monitor.receivedEvents.length} 个观察器事件`);
    }, 30000);
    
  } catch (error) {
    console.error('❌ 监控器启动失败:', error);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ObserverMonitor;
