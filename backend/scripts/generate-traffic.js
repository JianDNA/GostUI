#!/usr/bin/env node

/**
 * 流量生成脚本
 * 通过向转发端口发送请求来生成真实的流量数据
 */

const http = require('http');
const https = require('https');
const { UserForwardRule, User } = require('../models');

// 生成随机数据
const generateRandomData = (sizeInMB) => {
  const sizeInBytes = sizeInMB * 1024 * 1024;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < sizeInBytes; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// 发送HTTP请求到指定端口
const sendRequest = (port, data = '') => {
  return new Promise((resolve, reject) => {
    const postData = data || generateRandomData(0.1); // 默认100KB数据
    
    const options = {
      hostname: 'localhost',
      port: port,
      path: '/api/test',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          requestSize: Buffer.byteLength(postData),
          responseSize: Buffer.byteLength(responseData),
          totalSize: Buffer.byteLength(postData) + Buffer.byteLength(responseData)
        });
      });
    });

    req.on('error', (err) => {
      // 忽略连接错误，因为目标可能不存在，但GOST会记录流量
      resolve({
        statusCode: 0,
        requestSize: Buffer.byteLength(postData),
        responseSize: 0,
        totalSize: Buffer.byteLength(postData),
        error: err.message
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        statusCode: 0,
        requestSize: Buffer.byteLength(postData),
        responseSize: 0,
        totalSize: Buffer.byteLength(postData),
        error: 'timeout'
      });
    });

    req.write(postData);
    req.end();
  });
};

// 为单个端口生成流量
const generateTrafficForPort = async (port, ruleName, rounds = 5) => {
  console.log(`🔄 为端口 ${port} (${ruleName}) 生成流量...`);
  
  let totalTraffic = 0;
  
  for (let i = 0; i < rounds; i++) {
    try {
      // 随机生成0.1MB到2MB的数据
      const dataSizeMB = Math.random() * 1.9 + 0.1;
      const data = generateRandomData(dataSizeMB);
      
      const result = await sendRequest(port, data);
      totalTraffic += result.totalSize;
      
      console.log(`   第${i+1}轮: ${(result.totalSize / 1024 / 1024).toFixed(2)}MB ${result.error ? `(${result.error})` : '✅'}`);
      
      // 随机延迟100-500ms
      await new Promise(resolve => setTimeout(resolve, Math.random() * 400 + 100));
      
    } catch (error) {
      console.log(`   第${i+1}轮: 失败 - ${error.message}`);
    }
  }
  
  console.log(`   📊 端口 ${port} 总流量: ${(totalTraffic / 1024 / 1024).toFixed(2)}MB`);
  return totalTraffic;
};

// 主函数
async function generateTraffic() {
  try {
    console.log('🚀 开始生成流量数据...');
    
    // 获取所有活跃的转发规则
    const activeRules = await UserForwardRule.findAll({
      where: { isActive: true },
      include: [{
        model: User,
        attributes: ['username']
      }]
    });
    
    if (activeRules.length === 0) {
      console.log('⚠️  没有找到活跃的转发规则');
      return;
    }
    
    console.log(`📋 找到 ${activeRules.length} 个活跃的转发规则`);
    
    let totalTraffic = 0;
    
    // 为每个规则生成流量
    for (const rule of activeRules) {
      const username = rule.User ? rule.User.username : 'unknown';
      const traffic = await generateTrafficForPort(
        rule.sourcePort, 
        `${username}-${rule.name}`,
        Math.floor(Math.random() * 5) + 3 // 3-7轮请求
      );
      totalTraffic += traffic;
      
      // 规则间延迟
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`\n🎉 流量生成完成！`);
    console.log(`📊 总流量: ${(totalTraffic / 1024 / 1024).toFixed(2)}MB`);
    console.log(`🔍 请检查GOST观察器日志和流量统计页面`);
    
  } catch (error) {
    console.error('❌ 生成流量失败:', error);
    process.exit(1);
  }
}

// 持续生成流量的函数
async function generateContinuousTraffic(intervalMinutes = 5, rounds = 10) {
  console.log(`🔄 开始持续生成流量 (间隔: ${intervalMinutes}分钟, 轮数: ${rounds})`);
  
  for (let round = 1; round <= rounds; round++) {
    console.log(`\n=== 第 ${round}/${rounds} 轮 ===`);
    await generateTraffic();
    
    if (round < rounds) {
      console.log(`⏰ 等待 ${intervalMinutes} 分钟后开始下一轮...`);
      await new Promise(resolve => setTimeout(resolve, intervalMinutes * 60 * 1000));
    }
  }
  
  console.log('\n🏁 持续流量生成完成！');
}

// 快速测试函数
async function quickTest() {
  try {
    console.log('⚡ 快速流量测试...');
    
    // 获取前3个活跃规则进行快速测试
    const rules = await UserForwardRule.findAll({
      where: { isActive: true },
      limit: 3,
      include: [{
        model: User,
        attributes: ['username']
      }]
    });
    
    if (rules.length === 0) {
      console.log('⚠️  没有找到活跃的转发规则');
      return;
    }
    
    console.log(`🎯 对 ${rules.length} 个规则进行快速测试`);
    
    for (const rule of rules) {
      const username = rule.User ? rule.User.username : 'unknown';
      await generateTrafficForPort(rule.sourcePort, `${username}-${rule.name}`, 2);
    }
    
    console.log('⚡ 快速测试完成！');
    
  } catch (error) {
    console.error('❌ 快速测试失败:', error);
  }
}

// 命令行参数处理
const command = process.argv[2];
const param = process.argv[3];

switch (command) {
  case 'continuous':
    const interval = parseInt(param) || 5;
    generateContinuousTraffic(interval).then(() => process.exit(0));
    break;
  case 'quick':
    quickTest().then(() => process.exit(0));
    break;
  default:
    generateTraffic().then(() => process.exit(0));
}
