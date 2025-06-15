#!/usr/bin/env node

/**
 * 快速流量测试
 */

const net = require('net');
const http = require('http');

class QuickTrafficTester {
  constructor() {
    this.testPort = 28888;
    this.testUserId = 1;
  }

  async getAuthToken() {
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

  async getUserTraffic() {
    try {
      const token = await this.getAuthToken();

      return new Promise((resolve) => {
        const options = {
          hostname: 'localhost',
          port: 3000,
          path: `/api/users/${this.testUserId}`,
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

  async createTestServer(port, responseSize) {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        console.log(`📥 测试服务器收到请求`);
        
        const data = Buffer.alloc(responseSize, 'A');
        
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': data.length
        });
        
        res.end(data);
      });
      
      server.listen(port, 'localhost', (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`✅ 测试服务器启动在端口 ${port}`);
          resolve(server);
        }
      });
    });
  }

  async sendRequestThroughProxy(targetHost, targetPort) {
    return new Promise((resolve) => {
      console.log(`🔄 通过代理连接: localhost:${this.testPort} -> ${targetHost}:${targetPort}`);
      
      let receivedBytes = 0;
      
      const socket = net.createConnection(this.testPort, 'localhost', () => {
        console.log('✅ 代理连接建立');
        
        const request = `GET / HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\nConnection: close\r\n\r\n`;
        socket.write(request);
      });
      
      socket.on('data', (data) => {
        receivedBytes += data.length;
      });
      
      socket.on('end', () => {
        console.log(`✅ 连接结束: 接收 ${receivedBytes} 字节`);
        resolve({ receivedBytes, success: true });
      });
      
      socket.on('error', (error) => {
        console.error('❌ 连接错误:', error.message);
        resolve({ receivedBytes, success: false, error: error.message });
      });
      
      setTimeout(() => {
        socket.destroy();
        resolve({ receivedBytes, success: false, error: 'timeout' });
      }, 10000);
    });
  }

  async runQuickTest() {
    console.log('🚀 开始快速流量测试');
    
    const testSize = 1024 * 1024; // 1MB
    const testServerPort = 8888;
    
    // 启动测试服务器
    const testServer = await this.createTestServer(testServerPort, testSize);
    
    try {
      console.log(`\n📋 测试 1MB 文件传输...`);
      
      // 获取测试前流量
      const trafficBefore = await this.getUserTraffic();
      console.log(`📊 测试前流量: ${(trafficBefore / 1024 / 1024).toFixed(2)}MB`);
      
      // 通过代理下载
      const result = await this.sendRequestThroughProxy('localhost', testServerPort);
      console.log(`📦 传输结果: ${result.success ? '成功' : '失败'}, 接收 ${(result.receivedBytes / 1024).toFixed(1)}KB`);
      
      // 等待观察器统计（10秒周期 + 缓冲时间）
      console.log('⏰ 等待流量统计更新...');
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      // 获取测试后流量
      const trafficAfter = await this.getUserTraffic();
      console.log(`📊 测试后流量: ${(trafficAfter / 1024 / 1024).toFixed(2)}MB`);
      
      const actualIncrease = trafficAfter - trafficBefore;
      console.log(`📈 流量增量: ${(actualIncrease / 1024).toFixed(1)}KB`);
      
      // 分析结果
      if (actualIncrease > 0) {
        const accuracy = (actualIncrease / result.receivedBytes) * 100;
        console.log(`✅ 流量统计正常，准确度: ${accuracy.toFixed(1)}%`);
      } else {
        console.log(`⚠️  BUG确认: 传输了 ${(result.receivedBytes / 1024).toFixed(1)}KB 但流量统计没有更新!`);
      }
      
    } finally {
      testServer.close();
      console.log('🔚 测试服务器已关闭');
    }
  }

  async testFailedConnection() {
    console.log('\n🧪 测试转发失败时的流量统计');
    
    // 获取测试前流量
    const trafficBefore = await this.getUserTraffic();
    console.log(`📊 测试前流量: ${(trafficBefore / 1024 / 1024).toFixed(2)}MB`);
    
    // 尝试连接不存在的服务
    const result = await this.sendRequestThroughProxy('localhost', 99999);
    console.log(`📦 连接结果: ${result.success ? '成功' : '失败'} (${result.error || 'OK'})`);
    
    // 等待统计更新
    console.log('⏰ 等待流量统计更新...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    // 获取测试后流量
    const trafficAfter = await this.getUserTraffic();
    console.log(`📊 测试后流量: ${(trafficAfter / 1024 / 1024).toFixed(2)}MB`);
    
    const actualIncrease = trafficAfter - trafficBefore;
    console.log(`📈 流量增量: ${(actualIncrease / 1024).toFixed(1)}KB`);
    
    if (actualIncrease > 0 && result.error) {
      console.log(`⚠️  BUG确认: 连接失败但仍统计了 ${(actualIncrease / 1024).toFixed(1)}KB 流量!`);
    } else {
      console.log(`✅ 正常: 连接失败时没有统计流量`);
    }
  }
}

async function main() {
  const tester = new QuickTrafficTester();
  
  try {
    await tester.runQuickTest();
    await tester.testFailedConnection();
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = QuickTrafficTester;
