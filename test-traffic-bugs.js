#!/usr/bin/env node

/**
 * GOST流量统计Bug测试脚本
 * 
 * 测试两个已知问题：
 * 1. 流量统计不准确 - 下载100MB文件，有时显示100多MB，有时只有几十MB
 * 2. 转发失败时仍然统计流量 - 目标地址错误时也会上报流量
 */

const net = require('net');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');

class TrafficBugTester {
  constructor() {
    this.baseUrl = 'http://localhost:3000/api';
    this.testResults = [];
    this.testPort = 29082; // 使用现有的测试端口
    this.testUserId = 1; // admin用户
  }

  /**
   * 生成测试数据
   */
  generateTestData(sizeInMB) {
    const sizeInBytes = sizeInMB * 1024 * 1024;
    const buffer = Buffer.alloc(sizeInBytes);
    
    // 填充随机数据以模拟真实文件
    for (let i = 0; i < sizeInBytes; i += 1024) {
      const chunk = crypto.randomBytes(Math.min(1024, sizeInBytes - i));
      chunk.copy(buffer, i);
    }
    
    return buffer;
  }

  /**
   * 创建简单的HTTP服务器用于测试
   */
  async createTestServer(port, responseData) {
    return new Promise((resolve, reject) => {
      const server = require('http').createServer((req, res) => {
        console.log(`📥 测试服务器收到请求: ${req.method} ${req.url}`);
        
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': responseData.length
        });
        
        // 分块发送数据，模拟真实下载
        let sent = 0;
        const chunkSize = 64 * 1024; // 64KB chunks
        
        const sendChunk = () => {
          if (sent >= responseData.length) {
            res.end();
            return;
          }
          
          const chunk = responseData.slice(sent, Math.min(sent + chunkSize, responseData.length));
          res.write(chunk);
          sent += chunk.length;
          
          // 添加小延迟模拟网络传输
          setTimeout(sendChunk, 10);
        };
        
        sendChunk();
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
   * 获取用户当前流量统计
   */
  async getUserTraffic() {
    return new Promise((resolve) => {
      const options = {
        hostname: 'localhost',
        port: 3000,
        path: `/api/users/${this.testUserId}`,
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            resolve({
              usedTraffic: response.user?.usedTraffic || 0,
              timestamp: Date.now()
            });
          } catch (error) {
            console.error('❌ 解析用户流量数据失败:', error.message);
            resolve({ usedTraffic: 0, timestamp: Date.now() });
          }
        });
      });

      req.on('error', (error) => {
        console.error('❌ 获取用户流量失败:', error.message);
        resolve({ usedTraffic: 0, timestamp: Date.now() });
      });

      req.end();
    });
  }

  /**
   * 通过GOST代理下载数据
   */
  async downloadThroughProxy(targetUrl, expectedSize) {
    return new Promise((resolve, reject) => {
      const proxyHost = 'localhost';
      const proxyPort = this.testPort;
      
      console.log(`🔄 通过代理下载: ${proxyHost}:${proxyPort} -> ${targetUrl}`);
      
      const startTime = Date.now();
      let receivedBytes = 0;
      
      const socket = net.createConnection(proxyPort, proxyHost, () => {
        console.log('✅ 代理连接建立');
        
        // 发送HTTP请求
        const request = `GET / HTTP/1.1\r\nHost: ${targetUrl}\r\nConnection: close\r\n\r\n`;
        socket.write(request);
      });
      
      socket.on('data', (data) => {
        receivedBytes += data.length;
        
        // 显示进度
        if (receivedBytes % (1024 * 1024) === 0) {
          console.log(`📊 已接收: ${(receivedBytes / 1024 / 1024).toFixed(1)}MB`);
        }
      });
      
      socket.on('end', () => {
        const duration = Date.now() - startTime;
        console.log(`✅ 下载完成: ${(receivedBytes / 1024 / 1024).toFixed(2)}MB in ${duration}ms`);
        resolve({
          receivedBytes,
          duration,
          expectedSize
        });
      });
      
      socket.on('error', (error) => {
        console.error('❌ 代理连接错误:', error.message);
        resolve({
          receivedBytes,
          duration: Date.now() - startTime,
          expectedSize,
          error: error.message
        });
      });
      
      // 超时处理
      setTimeout(() => {
        socket.destroy();
        resolve({
          receivedBytes,
          duration: Date.now() - startTime,
          expectedSize,
          error: 'timeout'
        });
      }, 60000); // 60秒超时
    });
  }

  /**
   * 测试1: 流量统计准确性
   */
  async testTrafficAccuracy() {
    console.log('\n🧪 测试1: 流量统计准确性');
    console.log('=' .repeat(50));
    
    const testSizes = [10, 50, 100]; // MB
    const testResults = [];
    
    for (const sizeInMB of testSizes) {
      console.log(`\n📋 测试 ${sizeInMB}MB 文件下载...`);
      
      // 创建测试数据
      const testData = this.generateTestData(sizeInMB);
      console.log(`📦 生成测试数据: ${(testData.length / 1024 / 1024).toFixed(2)}MB`);
      
      // 启动测试服务器
      const testServerPort = 8888;
      const testServer = await this.createTestServer(testServerPort, testData);
      
      try {
        // 进行多次测试
        for (let i = 0; i < 3; i++) {
          console.log(`\n🔄 第 ${i + 1} 次测试:`);
          
          // 获取测试前流量
          const trafficBefore = await this.getUserTraffic();
          console.log(`📊 测试前流量: ${(trafficBefore.usedTraffic / 1024 / 1024).toFixed(2)}MB`);
          
          // 等待一下确保统计稳定
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // 通过代理下载
          const downloadResult = await this.downloadThroughProxy(`localhost:${testServerPort}`, testData.length);
          
          // 等待流量统计更新
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // 获取测试后流量
          const trafficAfter = await this.getUserTraffic();
          console.log(`📊 测试后流量: ${(trafficAfter.usedTraffic / 1024 / 1024).toFixed(2)}MB`);
          
          const actualTrafficIncrease = trafficAfter.usedTraffic - trafficBefore.usedTraffic;
          const expectedTraffic = downloadResult.receivedBytes;
          const accuracy = expectedTraffic > 0 ? (actualTrafficIncrease / expectedTraffic) * 100 : 0;
          
          const result = {
            testSize: sizeInMB,
            attempt: i + 1,
            expectedBytes: testData.length,
            receivedBytes: downloadResult.receivedBytes,
            reportedTrafficIncrease: actualTrafficIncrease,
            accuracy: accuracy,
            error: downloadResult.error
          };
          
          testResults.push(result);
          
          console.log(`📈 结果分析:`);
          console.log(`   期望大小: ${(testData.length / 1024 / 1024).toFixed(2)}MB`);
          console.log(`   实际接收: ${(downloadResult.receivedBytes / 1024 / 1024).toFixed(2)}MB`);
          console.log(`   流量增量: ${(actualTrafficIncrease / 1024 / 1024).toFixed(2)}MB`);
          console.log(`   准确度: ${accuracy.toFixed(1)}%`);
          
          if (Math.abs(accuracy - 100) > 10) {
            console.log(`⚠️  流量统计不准确! 偏差: ${(accuracy - 100).toFixed(1)}%`);
          }
        }
        
      } finally {
        testServer.close();
        console.log('🔚 测试服务器已关闭');
      }
    }
    
    return testResults;
  }

  /**
   * 测试2: 转发失败时的流量统计
   */
  async testFailedForwardingTraffic() {
    console.log('\n🧪 测试2: 转发失败时的流量统计');
    console.log('=' .repeat(50));
    
    const testCases = [
      { target: 'nonexistent.example.com:80', description: '不存在的域名' },
      { target: '192.168.255.255:80', description: '不可达的IP地址' },
      { target: 'localhost:99999', description: '无效端口' }
    ];
    
    const testResults = [];
    
    for (const testCase of testCases) {
      console.log(`\n📋 测试场景: ${testCase.description}`);
      console.log(`🎯 目标地址: ${testCase.target}`);
      
      // 获取测试前流量
      const trafficBefore = await this.getUserTraffic();
      console.log(`📊 测试前流量: ${(trafficBefore.usedTraffic / 1024 / 1024).toFixed(2)}MB`);
      
      // 等待统计稳定
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 尝试通过代理连接失败的目标
      const downloadResult = await this.downloadThroughProxy(testCase.target, 0);
      
      // 等待流量统计更新
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // 获取测试后流量
      const trafficAfter = await this.getUserTraffic();
      console.log(`📊 测试后流量: ${(trafficAfter.usedTraffic / 1024 / 1024).toFixed(2)}MB`);
      
      const actualTrafficIncrease = trafficAfter.usedTraffic - trafficBefore.usedTraffic;
      
      const result = {
        target: testCase.target,
        description: testCase.description,
        receivedBytes: downloadResult.receivedBytes,
        reportedTrafficIncrease: actualTrafficIncrease,
        connectionError: downloadResult.error,
        shouldHaveNoTraffic: actualTrafficIncrease === 0
      };
      
      testResults.push(result);
      
      console.log(`📈 结果分析:`);
      console.log(`   连接结果: ${downloadResult.error || '成功'}`);
      console.log(`   接收数据: ${downloadResult.receivedBytes} 字节`);
      console.log(`   流量增量: ${(actualTrafficIncrease / 1024).toFixed(2)}KB`);
      
      if (actualTrafficIncrease > 0 && downloadResult.error) {
        console.log(`⚠️  BUG确认: 转发失败但仍统计了 ${(actualTrafficIncrease / 1024).toFixed(2)}KB 流量!`);
      } else if (actualTrafficIncrease === 0) {
        console.log(`✅ 正常: 转发失败时没有统计流量`);
      }
    }
    
    return testResults;
  }

  /**
   * 运行所有测试
   */
  async runAllTests() {
    console.log('🚀 开始GOST流量统计Bug测试');
    console.log('测试端口:', this.testPort);
    console.log('测试用户ID:', this.testUserId);
    
    try {
      // 测试1: 流量统计准确性
      const accuracyResults = await this.testTrafficAccuracy();
      
      // 测试2: 转发失败时的流量统计
      const failureResults = await this.testFailedForwardingTraffic();
      
      // 生成测试报告
      this.generateReport(accuracyResults, failureResults);
      
    } catch (error) {
      console.error('❌ 测试执行失败:', error);
    }
  }

  /**
   * 生成测试报告
   */
  generateReport(accuracyResults, failureResults) {
    console.log('\n📊 测试报告');
    console.log('=' .repeat(60));
    
    // 准确性测试报告
    console.log('\n1. 流量统计准确性测试:');
    const accuracyIssues = accuracyResults.filter(r => Math.abs((r.reportedTrafficIncrease / r.receivedBytes) * 100 - 100) > 10);
    
    if (accuracyIssues.length > 0) {
      console.log(`❌ 发现 ${accuracyIssues.length} 个准确性问题:`);
      accuracyIssues.forEach(issue => {
        const accuracy = issue.receivedBytes > 0 ? (issue.reportedTrafficIncrease / issue.receivedBytes) * 100 : 0;
        console.log(`   - ${issue.testSize}MB测试第${issue.attempt}次: 准确度 ${accuracy.toFixed(1)}%`);
      });
    } else {
      console.log('✅ 流量统计准确性正常');
    }
    
    // 失败转发测试报告
    console.log('\n2. 转发失败流量统计测试:');
    const failureIssues = failureResults.filter(r => r.reportedTrafficIncrease > 0 && r.connectionError);
    
    if (failureIssues.length > 0) {
      console.log(`❌ 发现 ${failureIssues.length} 个转发失败流量统计问题:`);
      failureIssues.forEach(issue => {
        console.log(`   - ${issue.description}: 统计了 ${(issue.reportedTrafficIncrease / 1024).toFixed(2)}KB 流量`);
      });
    } else {
      console.log('✅ 转发失败时流量统计正常');
    }
    
    // 总结
    console.log('\n📋 总结:');
    const totalIssues = accuracyIssues.length + failureIssues.length;
    if (totalIssues > 0) {
      console.log(`❌ 共发现 ${totalIssues} 个问题需要修复`);
    } else {
      console.log('✅ 所有测试通过，未发现已知bug');
    }
  }
}

// 运行测试
if (require.main === module) {
  const tester = new TrafficBugTester();
  tester.runAllTests().catch(console.error);
}

module.exports = TrafficBugTester;
