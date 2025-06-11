#!/usr/bin/env node

/**
 * 简单的流量测试脚本
 * 
 * 直接通过端口连接测试流量统计和限制功能
 */

const net = require('net');

class SimpleTrafficTest {
  constructor() {
    this.testPorts = [2365, 6443];
    this.testData = Buffer.alloc(1024 * 1024, 'A'); // 1MB数据
  }

  /**
   * 测试端口连接并发送数据
   */
  async testPortTraffic(port, rounds = 5) {
    console.log(`\n🧪 测试端口 ${port} (${rounds}轮)...`);
    
    for (let i = 1; i <= rounds; i++) {
      try {
        console.log(`  第${i}轮: 发送1MB数据...`);
        
        await new Promise((resolve, reject) => {
          const client = new net.Socket();
          let dataReceived = 0;
          
          const timeout = setTimeout(() => {
            client.destroy();
            reject(new Error('连接超时'));
          }, 5000);
          
          client.connect(port, 'localhost', () => {
            console.log(`    ✅ 连接到端口${port}成功`);
            
            // 发送数据
            client.write(this.testData);
            console.log(`    📤 已发送1MB数据`);
          });
          
          client.on('data', (data) => {
            dataReceived += data.length;
            console.log(`    📥 收到${data.length}字节数据`);
          });
          
          client.on('close', () => {
            clearTimeout(timeout);
            console.log(`    🔚 连接关闭，总共收到${dataReceived}字节`);
            resolve();
          });
          
          client.on('error', (err) => {
            clearTimeout(timeout);
            console.log(`    ❌ 连接错误: ${err.message}`);
            reject(err);
          });
          
          // 2秒后关闭连接
          setTimeout(() => {
            client.end();
          }, 2000);
        });
        
        // 等待1秒再进行下一轮
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.log(`    ❌ 第${i}轮失败: ${error.message}`);
      }
    }
  }

  /**
   * 运行完整测试
   */
  async runTest() {
    try {
      console.log('🚀 开始简单流量测试');
      console.log('📊 测试目标: 验证流量统计和端口连接');
      
      // 测试每个端口
      for (const port of this.testPorts) {
        await this.testPortTraffic(port, 3);
        
        // 端口间等待2秒
        console.log('\n⏳ 等待2秒...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      console.log('\n🎉 流量测试完成！');
      console.log('\n📋 测试总结:');
      console.log(`   - 测试端口: ${this.testPorts.join(', ')}`);
      console.log(`   - 每端口轮数: 3轮`);
      console.log(`   - 每轮数据量: 1MB`);
      console.log(`   - 预期总流量: ${this.testPorts.length * 3 * 1}MB`);
      
      console.log('\n💡 请检查后端日志中的流量统计信息');
      
    } catch (error) {
      console.error('❌ 测试失败:', error);
    }
  }
}

// 执行测试
if (require.main === module) {
  const test = new SimpleTrafficTest();
  test.runTest()
    .then(() => {
      console.log('\n✅ 测试脚本执行完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ 测试脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = SimpleTrafficTest;
