#!/usr/bin/env node

/**
 * 测试数据生成脚本
 * 用于创建用户、转发规则和流量统计数据
 */

const { User, UserForwardRule, TrafficLog } = require('../models');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');

// 测试用户数据
const testUsers = [
  {
    username: 'user1',
    password: '123456',
    email: 'user1@test.com',
    role: 'user',
    trafficQuota: 1.0, // 1GB
    portRangeStart: 10100,
    portRangeEnd: 10199,
    expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30天后过期
  },
  {
    username: 'user2',
    password: '123456',
    email: 'user2@test.com',
    role: 'user',
    trafficQuota: 2.0, // 2GB
    portRangeStart: 10200,
    portRangeEnd: 10299,
    expiryDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) // 60天后过期
  },
  {
    username: 'user3',
    password: '123456',
    email: 'user3@test.com',
    role: 'user',
    trafficQuota: 0.5, // 512MB
    portRangeStart: 10300,
    portRangeEnd: 10399,
    expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) // 15天后过期
  }
];

// 生成转发规则
const generateForwardRules = (userId, username) => {
  const basePort = 10000 + userId * 100;
  return [
    {
      userId,
      name: `${username}-web`,
      sourcePort: basePort,
      targetHost: 'localhost',
      targetPort: 3000,
      protocol: 'tcp',
      isActive: true
    },
    {
      userId,
      name: `${username}-api`,
      sourcePort: basePort + 1,
      targetHost: 'localhost', 
      targetPort: 3000,
      protocol: 'tcp',
      isActive: true
    },
    {
      userId,
      name: `${username}-test`,
      sourcePort: basePort + 2,
      targetHost: 'localhost',
      targetPort: 3000,
      protocol: 'tcp',
      isActive: true
    }
  ];
};

// 生成流量日志数据
const generateTrafficLogs = (userId, ruleId, ruleName, port) => {
  const logs = [];
  const now = new Date();
  
  // 生成最近7天的流量数据
  for (let day = 6; day >= 0; day--) {
    const date = new Date(now.getTime() - day * 24 * 60 * 60 * 1000);
    
    // 每天生成3-8条记录
    const recordCount = Math.floor(Math.random() * 6) + 3;
    
    for (let i = 0; i < recordCount; i++) {
      const timestamp = new Date(date.getTime() + Math.random() * 24 * 60 * 60 * 1000);
      const inputBytes = Math.floor(Math.random() * 50 * 1024 * 1024); // 0-50MB
      const outputBytes = Math.floor(Math.random() * 100 * 1024 * 1024); // 0-100MB
      
      logs.push({
        userId,
        ruleId,
        ruleName,
        port,
        inputBytes,
        outputBytes,
        totalBytes: inputBytes + outputBytes,
        timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }
  }
  
  return logs;
};

// 主函数
async function generateTestData() {
  try {
    console.log('🚀 开始生成测试数据...');
    
    // 1. 创建测试用户
    console.log('👥 创建测试用户...');
    const createdUsers = [];
    
    for (const userData of testUsers) {
      // 检查用户是否已存在
      const existingUser = await User.findOne({ where: { username: userData.username } });
      
      if (existingUser) {
        console.log(`   ⚠️  用户 ${userData.username} 已存在，跳过创建`);
        createdUsers.push(existingUser);
        continue;
      }
      
      // 加密密码
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      const user = await User.create({
        ...userData,
        password: hashedPassword
      });
      
      createdUsers.push(user);
      console.log(`   ✅ 创建用户: ${user.username} (ID: ${user.id})`);
    }
    
    // 2. 创建转发规则
    console.log('🔀 创建转发规则...');
    const createdRules = [];
    
    for (const user of createdUsers) {
      const rules = generateForwardRules(user.id, user.username);
      
      for (const ruleData of rules) {
        // 检查端口是否已被使用
        const existingRule = await UserForwardRule.findOne({ 
          where: { sourcePort: ruleData.sourcePort } 
        });
        
        if (existingRule) {
          console.log(`   ⚠️  端口 ${ruleData.sourcePort} 已被使用，跳过创建`);
          continue;
        }
        
        const rule = await UserForwardRule.create(ruleData);
        createdRules.push(rule);
        console.log(`   ✅ 创建规则: ${rule.name} (${rule.sourcePort} -> ${rule.targetHost}:${rule.targetPort})`);
      }
    }
    
    // 3. 生成流量日志
    console.log('📊 生成流量日志...');
    let totalLogs = 0;
    
    for (const rule of createdRules) {
      const logs = generateTrafficLogs(rule.userId, rule.id, rule.name, rule.sourcePort);
      
      // 批量插入流量日志
      await TrafficLog.bulkCreate(logs);
      totalLogs += logs.length;
      
      console.log(`   ✅ 为规则 ${rule.name} 生成 ${logs.length} 条流量记录`);
    }
    
    // 4. 统计信息
    console.log('\n📈 数据生成完成！');
    console.log(`   👥 用户数量: ${createdUsers.length}`);
    console.log(`   🔀 转发规则: ${createdRules.length}`);
    console.log(`   📊 流量日志: ${totalLogs} 条`);
    
    // 5. 显示用户信息
    console.log('\n👤 测试用户信息:');
    for (const user of createdUsers) {
      const userRules = createdRules.filter(rule => rule.userId === user.id);
      const ports = userRules.map(rule => rule.sourcePort).join(', ');
      console.log(`   ${user.username}: 端口 ${ports}`);
    }
    
    console.log('\n🎉 测试数据生成完成！现在可以测试流量统计功能了。');
    
  } catch (error) {
    console.error('❌ 生成测试数据失败:', error);
    process.exit(1);
  }
}

// 清理测试数据的函数
async function cleanTestData() {
  try {
    console.log('🧹 清理测试数据...');
    
    // 删除测试用户的流量日志
    const testUsernames = testUsers.map(u => u.username);
    const testUsersInDb = await User.findAll({
      where: { username: { [Op.in]: testUsernames } }
    });
    
    const testUserIds = testUsersInDb.map(u => u.id);
    
    if (testUserIds.length > 0) {
      // 删除流量日志
      const deletedLogs = await TrafficLog.destroy({
        where: { userId: { [Op.in]: testUserIds } }
      });
      console.log(`   ✅ 删除 ${deletedLogs} 条流量日志`);
      
      // 删除转发规则
      const deletedRules = await UserForwardRule.destroy({
        where: { userId: { [Op.in]: testUserIds } }
      });
      console.log(`   ✅ 删除 ${deletedRules} 条转发规则`);
      
      // 删除用户（保留admin和test用户）
      const deletedUsers = await User.destroy({
        where: { 
          username: { [Op.in]: testUsernames },
          username: { [Op.notIn]: ['admin', 'test'] }
        }
      });
      console.log(`   ✅ 删除 ${deletedUsers} 个测试用户`);
    }
    
    console.log('🎉 测试数据清理完成！');
    
  } catch (error) {
    console.error('❌ 清理测试数据失败:', error);
    process.exit(1);
  }
}

// 命令行参数处理
const command = process.argv[2];

if (command === 'clean') {
  cleanTestData().then(() => process.exit(0));
} else {
  generateTestData().then(() => process.exit(0));
}
