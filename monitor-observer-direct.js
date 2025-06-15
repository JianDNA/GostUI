#!/usr/bin/env node

/**
 * 直接监控观察器数据接收
 */

const http = require('http');

// 重写观察器处理函数，添加详细日志
const originalConsoleLog = console.log;
console.log = function(...args) {
  const timestamp = new Date().toISOString();
  originalConsoleLog(`[${timestamp}]`, ...args);
};

// 创建一个简单的HTTP服务器来拦截观察器请求
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.includes('observer')) {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log('🔍 观察器收到数据:');
        console.log(JSON.stringify(data, null, 2));
        
        if (data.events && Array.isArray(data.events)) {
          data.events.forEach((event, index) => {
            console.log(`📊 事件 ${index + 1}:`);
            console.log(`   类型: ${event.type}`);
            console.log(`   服务: ${event.service || 'N/A'}`);
            console.log(`   种类: ${event.kind || 'N/A'}`);
            
            if (event.stats) {
              console.log(`   统计: 输入=${event.stats.inputBytes || 0}, 输出=${event.stats.outputBytes || 0}`);
              console.log(`   连接: 总数=${event.stats.totalConns || 0}, 错误=${event.stats.totalErrs || 0}`);
            }
            
            if (event.client) {
              console.log(`   客户端: ${event.client}`);
            }
          });
        }

        // 转发到真正的观察器端点
        const forwardOptions = {
          hostname: 'localhost',
          port: 3000,
          path: '/api/gost-plugin/observer',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          }
        };

        const forwardReq = http.request(forwardOptions, (forwardRes) => {
          let forwardData = '';
          forwardRes.on('data', (chunk) => forwardData += chunk);
          forwardRes.on('end', () => {
            console.log('✅ 数据已转发到真正的观察器端点');
            res.writeHead(forwardRes.statusCode, forwardRes.headers);
            res.end(forwardData);
          });
        });

        forwardReq.on('error', (error) => {
          console.error('❌ 转发到观察器端点失败:', error);
          res.writeHead(500);
          res.end('Internal Server Error');
        });

        forwardReq.write(body);
        forwardReq.end();

      } catch (error) {
        console.error('❌ 解析观察器数据失败:', error);
        res.writeHead(400);
        res.end('Bad Request');
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// 启动监控服务器
const MONITOR_PORT = 3001;
server.listen(MONITOR_PORT, 'localhost', () => {
  console.log(`✅ 观察器监控器启动在端口 ${MONITOR_PORT}`);
  console.log('现在需要修改GOST配置指向这个监控器...');
});

// 修改GOST配置指向监控器
async function updateGostConfig() {
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
      config.observers[0].plugin.addr = `http://localhost:${MONITOR_PORT}/observer`;
      console.log(`🔄 更新观察器地址为: http://localhost:${MONITOR_PORT}/observer`);
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
      console.log('按 Ctrl+C 停止监控并恢复配置');
    }

  } catch (error) {
    console.error('❌ 更新GOST观察器配置失败:', error);
  }
}

// 恢复原始配置
async function restoreConfig() {
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

// 设置优雅退出
process.on('SIGINT', async () => {
  console.log('\n🔄 正在停止监控器...');
  await restoreConfig();
  server.close(() => {
    console.log('🔚 监控器已停止');
    process.exit(0);
  });
});

// 延迟启动配置更新
setTimeout(() => {
  updateGostConfig();
}, 2000);
