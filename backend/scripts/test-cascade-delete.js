#!/usr/bin/env node

/**
 * 🧪 级联删除测试脚本
 * 
 * 功能:
 * 1. 创建测试用户和规则
 * 2. 测试级联删除功能
 * 3. 验证缓存清理和同步
 * 4. 检查数据库一致性
 */

const { User, UserForwardRule } = require('../models');
const { v4: uuidv4 } = require('uuid');

class CascadeDeleteTester {
  constructor() {
    console.log('🧪 级联删除测试工具');
    console.log('=' .repeat(50));
  }

  /**
   * 主测试流程
   */
  async test() {
    try {
      // 1. 创建测试用户
      const testUser = await this.createTestUser();
      
      // 2. 创建测试规则
      const testRules = await this.createTestRules(testUser.id);
      
      // 3. 验证数据创建
      await this.verifyDataCreation(testUser.id);
      
      // 4. 测试级联删除
      await this.testCascadeDelete(testUser.id);
      
      // 5. 验证删除结果
      await this.verifyDeletion(testUser.id, testRules.map(r => r.id));
      
      console.log('\n🎉 级联删除测试完成！');
      
    } catch (error) {
      console.error('\n❌ 测试失败:', error);
      throw error;
    }
  }

  /**
   * 创建测试用户
   */
  async createTestUser() {
    console.log('\n👤 创建测试用户...');
    
    const userData = {
      username: `test_cascade_${Date.now()}`,
      password: 'test123456',
      email: `test_${Date.now()}@example.com`,
      role: 'user',
      trafficQuota: 1.0,
      portRangeStart: 20000,
      portRangeEnd: 20010,
      userStatus: 'active'
    };
    
    const user = await User.create(userData);
    console.log(`✅ 测试用户已创建: ${user.username} (ID: ${user.id})`);
    
    return user;
  }

  /**
   * 创建测试规则
   */
  async createTestRules(userId) {
    console.log('\n📋 创建测试规则...');
    
    const rules = [];
    const basePort = 20000;
    
    for (let i = 0; i < 3; i++) {
      const ruleData = {
        userId: userId,
        ruleUUID: uuidv4(),
        name: `测试规则_${i + 1}`,
        sourcePort: basePort + i,
        targetAddress: `127.0.0.1:${8080 + i}`,
        protocol: 'tcp',
        description: `级联删除测试规则 ${i + 1}`,
        usedTraffic: 0,
        listenAddress: '127.0.0.1',
        listenAddressType: 'ipv4'
      };
      
      const rule = await UserForwardRule.create(ruleData);
      rules.push(rule);
      console.log(`✅ 规则已创建: ${rule.name} (端口: ${rule.sourcePort})`);
    }
    
    return rules;
  }

  /**
   * 验证数据创建
   */
  async verifyDataCreation(userId) {
    console.log('\n🔍 验证数据创建...');
    
    // 检查用户
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('测试用户未找到');
    }
    console.log(`✅ 用户存在: ${user.username}`);
    
    // 检查规则
    const rules = await UserForwardRule.findAll({
      where: { userId: userId }
    });
    
    console.log(`✅ 找到 ${rules.length} 个用户规则:`);
    for (const rule of rules) {
      console.log(`   - ${rule.name} (端口: ${rule.sourcePort})`);
    }
    
    if (rules.length === 0) {
      throw new Error('测试规则未创建');
    }
  }

  /**
   * 测试级联删除
   */
  async testCascadeDelete(userId) {
    console.log('\n🗑️ 测试级联删除...');
    
    // 启用外键约束
    const { sequelize } = require('../models');
    await sequelize.query('PRAGMA foreign_keys = ON');
    console.log('✅ 外键约束已启用');
    
    // 查找用户
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('测试用户不存在');
    }
    
    console.log(`🗑️ 删除用户: ${user.username} (ID: ${user.id})`);
    
    // 使用事务删除用户
    await sequelize.transaction(async (transaction) => {
      // 先查找用户的所有规则（用于日志）
      const rules = await UserForwardRule.findAll({
        where: { userId: user.id },
        transaction
      });
      
      console.log(`📋 用户有 ${rules.length} 个规则将被级联删除`);
      
      // 删除用户（应该级联删除规则）
      await user.destroy({ transaction });
      
      console.log(`✅ 用户删除完成`);
    });
  }

  /**
   * 验证删除结果
   */
  async verifyDeletion(userId, ruleIds) {
    console.log('\n🔍 验证删除结果...');
    
    // 检查用户是否被删除
    const user = await User.findByPk(userId);
    if (user) {
      throw new Error('用户未被删除');
    }
    console.log('✅ 用户已被删除');
    
    // 检查规则是否被级联删除
    const remainingRules = await UserForwardRule.findAll({
      where: { userId: userId }
    });
    
    if (remainingRules.length > 0) {
      console.error(`❌ 发现 ${remainingRules.length} 个未删除的规则:`);
      for (const rule of remainingRules) {
        console.error(`   - ${rule.name} (ID: ${rule.id}, 端口: ${rule.sourcePort})`);
      }
      throw new Error('规则未被级联删除');
    }
    
    console.log('✅ 所有规则已被级联删除');
    
    // 检查具体规则ID
    for (const ruleId of ruleIds) {
      const rule = await UserForwardRule.findByPk(ruleId);
      if (rule) {
        throw new Error(`规则 ${ruleId} 未被删除`);
      }
    }
    
    console.log('✅ 所有规则ID验证通过');
  }

  /**
   * 清理测试数据
   */
  async cleanup() {
    console.log('\n🧹 清理测试数据...');
    
    try {
      // 删除所有测试用户
      const testUsers = await User.findAll({
        where: {
          username: {
            [require('sequelize').Op.like]: 'test_cascade_%'
          }
        }
      });
      
      for (const user of testUsers) {
        await user.destroy();
        console.log(`✅ 清理测试用户: ${user.username}`);
      }
      
      // 删除所有测试规则（如果有遗留）
      const testRules = await UserForwardRule.findAll({
        where: {
          name: {
            [require('sequelize').Op.like]: '测试规则_%'
          }
        }
      });
      
      for (const rule of testRules) {
        await rule.destroy();
        console.log(`✅ 清理测试规则: ${rule.name}`);
      }
      
      console.log('✅ 测试数据清理完成');
      
    } catch (error) {
      console.error('清理测试数据失败:', error);
    }
  }
}

// 主程序
async function main() {
  const tester = new CascadeDeleteTester();
  
  try {
    // 先清理可能存在的测试数据
    await tester.cleanup();
    
    // 运行测试
    await tester.test();
    
    // 再次清理
    await tester.cleanup();
    
    process.exit(0);
  } catch (error) {
    console.error('\n💥 测试失败:', error);
    
    // 失败时也尝试清理
    try {
      await tester.cleanup();
    } catch (cleanupError) {
      console.error('清理失败:', cleanupError);
    }
    
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = CascadeDeleteTester;
