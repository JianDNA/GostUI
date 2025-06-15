#!/usr/bin/env node

/**
 * 简化的GOST流量统计Bug测试
 */

const net = require('net');
const http = require('http');

class SimpleTrafficTester {
  constructor() {
    this.testPort = 28888; // 使用新创建的测试端口
    this.testUserId = 1; // admin用户
  }

  /**
   * 获取用户流量统计
   */
  async getUserTraffic() {
    return new Promise((resolve) => {
      const options = {
        hostname: 'localhost',
        port: 3000,
        path: `/api/users/${this.testUserId}`,
        method: 'GET'
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            resolve(response.user?.usedTraffic || 0);
          } catch (error) {
            console.error('❌ 解析流量数据失败:', error.message);
            resolve(0);
          }
        });
      });

      req.on('error', (error) => {
        console.error('❌ 获取流量失败:', error.message);
        resolve(0);
      });

      req.end();
    });
  }

  /**
   * 创建测试HTTP服务器
   */
  async createTestServer(port, responseSize) {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        console.log(`📥 测试服务器收到请求: ${req.method} ${req.url}`);
        
        // 生成指定大小的响应数据
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

  /**
   * 通过GOST代理发送请求
   */
  async sendRequestThroughProxy(targetHost, targetPort, requestData) {
    return new Promise((resolve) => {
      console.log(`🔄 通过代理连接: localhost:${this.testPort} -> ${targetHost}:${targetPort}`);
      
      const startTime = Date.now();
      let receivedBytes = 0;
      
      const socket = net.createConnection(this.testPort, 'localhost', () => {
        console.log('✅ 代理连接建立');
        
        // 发送HTTP请求
        const request = `GET / HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\nConnection: close\r\n\r\n`;
        socket.write(request);
      });
      
      socket.on('data', (data) => {
        receivedBytes += data.length;
      });
      
      socket.on('end', () => {
        const duration = Date.now() - startTime;
        console.log(`✅ 连接结束: 接收 ${receivedBytes} 字节, 耗时 ${duration}ms`);
        resolve({ receivedBytes, duration, success: true });
      });
      
      socket.on('error', (error) => {
        const duration = Date.now() - startTime;
        console.error('❌ 连接错误:', error.message);
        resolve({ receivedBytes, duration, success: false, error: error.message });
      });
      
      // 30秒超时
      setTimeout(() => {
        socket.destroy();
        resolve({ receivedBytes, duration: Date.now() - startTime, success: false, error: 'timeout' });
      }, 30000);
    });
  }

  /**
   * 测试1: 流量统计准确性
   */
  async testTrafficAccuracy() {
    console.log('\n🧪 测试1: 流量统计准确性');
    console.log('=' .repeat(50));
    
    const testSizes = [1024 * 1024, 5 * 1024 * 1024, 10 * 1024 * 1024]; // 1MB, 5MB, 10MB
    
    for (const sizeInBytes of testSizes) {
      const sizeInMB = sizeInBytes / (1024 * 1024);
      console.log(`\n📋 测试 ${sizeInMB}MB 文件下载...`);
      
      // 启动测试服务器
      const testServerPort = 8888;
      const testServer = await this.createTestServer(testServerPort, sizeInBytes);
      
      try {
        // 进行3次测试
        for (let i = 0; i < 3; i++) {
          console.log(`\n🔄 第 ${i + 1} 次测试:`);
          
          // 获取测试前流量
          const trafficBefore = await this.getUserTraffic();
          console.log(`📊 测试前流量: ${(trafficBefore / 1024 / 1024).toFixed(2)}MB`);
          
          // 等待统计稳定
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // 通过代理下载
          const result = await this.sendRequestThroughProxy('localhost', testServerPort);
          
          // 等待流量统计更新
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // 获取测试后流量
          const trafficAfter = await this.getUserTraffic();
          console.log(`📊 测试后流量: ${(trafficAfter / 1024 / 1024).toFixed(2)}MB`);
          
          const actualIncrease = trafficAfter - trafficBefore;
          const expectedBytes = result.receivedBytes;
          const accuracy = expectedBytes > 0 ? (actualIncrease / expectedBytes) * 100 : 0;
          
          console.log(`📈 结果分析:`);
          console.log(`   期望大小: ${(sizeInBytes / 1024 / 1024).toFixed(2)}MB`);
          console.log(`   实际接收: ${(result.receivedBytes / 1024 / 1024).toFixed(2)}MB`);
          console.log(`   流量增量: ${(actualIncrease / 1024 / 1024).toFixed(2)}MB`);
          console.log(`   准确度: ${accuracy.toFixed(1)}%`);
          
          if (Math.abs(accuracy - 100) > 10) {
            console.log(`⚠️  流量统计不准确! 偏差: ${(accuracy - 100).toFixed(1)}%`);
          } else {
            console.log(`✅ 流量统计准确`);
          }
        }
        
      } finally {
        testServer.close();
        console.log('🔚 测试服务器已关闭');
      }
    }
  }

  /**
   * 测试2: 转发失败时的流量统计
   */
  async testFailedForwardingTraffic() {
    console.log('\n🧪 测试2: 转发失败时的流量统计');
    console.log('=' .repeat(50));
    
    const testCases = [
      { host: 'nonexistent.example.com', port: 80, description: '不存在的域名' },
      { host: '192.168.255.255', port: 80, description: '不可达的IP地址' },
      { host: 'localhost', port: 99999, description: '无效端口' }
    ];
    
    for (const testCase of testCases) {
      console.log(`\n📋 测试场景: ${testCase.description}`);
      console.log(`🎯 目标地址: ${testCase.host}:${testCase.port}`);
      
      // 获取测试前流量
      const trafficBefore = await this.getUserTraffic();
      console.log(`📊 测试前流量: ${(trafficBefore / 1024 / 1024).toFixed(2)}MB`);
      
      // 等待统计稳定
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 尝试通过代理连接失败的目标
      const result = await this.sendRequestThroughProxy(testCase.host, testCase.port);
      
      // 等待流量统计更新
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // 获取测试后流量
      const trafficAfter = await this.getUserTraffic();
      console.log(`📊 测试后流量: ${(trafficAfter / 1024 / 1024).toFixed(2)}MB`);
      
      const actualIncrease = trafficAfter - trafficBefore;
      
      console.log(`📈 结果分析:`);
      console.log(`   连接结果: ${result.error || '成功'}`);
      console.log(`   接收数据: ${result.receivedBytes} 字节`);
      console.log(`   流量增量: ${(actualIncrease / 1024).toFixed(2)}KB`);
      
      if (actualIncrease > 0 && result.error) {
        console.log(`⚠️  BUG确认: 转发失败但仍统计了 ${(actualIncrease / 1024).toFixed(2)}KB 流量!`);
      } else if (actualIncrease === 0) {
        console.log(`✅ 正常: 转发失败时没有统计流量`);
      } else {
        console.log(`✅ 正常: 转发成功并统计了流量`);
      }
    }
  }

  /**
   * 运行所有测试
   */
  async runAllTests() {
    console.log('🚀 开始GOST流量统计Bug测试');
    console.log(`测试端口: ${this.testPort}`);
    console.log(`测试用户ID: ${this.testUserId}`);
    
    try {
      // 检查后端连接
      const initialTraffic = await this.getUserTraffic();
      console.log(`📊 当前用户流量: ${(initialTraffic / 1024 / 1024).toFixed(2)}MB`);
      
      // 测试1: 流量统计准确性
      await this.testTrafficAccuracy();
      
      // 测试2: 转发失败时的流量统计
      await this.testFailedForwardingTraffic();
      
      console.log('\n📊 测试完成');
      
    } catch (error) {
      console.error('❌ 测试执行失败:', error);
    }
  }
}

// 运行测试
if (require.main === module) {
  const tester = new SimpleTrafficTester();
  tester.runAllTests().catch(console.error);
}

module.exports = SimpleTrafficTester;
