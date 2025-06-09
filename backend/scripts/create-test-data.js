/**
 * 创建测试数据脚本
 */

const { sequelize, models } = require('../services/dbService');
const { User, UserForwardRule } = models;

class TestDataGenerator {
  constructor() {
    this.createdUsers = [];
    this.createdRules = [];
  }

  async createTestUsers(count = 10) {
    console.log(`👥 创建 ${count} 个测试用户...`);
    
    for (let i = 1; i <= count; i++) {
      const user = await User.create({
        username: `testuser${i}`,
        password: 'test123',
        role: 'user',
        portRangeStart: 7000 + i * 10,
        portRangeEnd: 7000 + i * 10 + 9,
        trafficQuota: 1024 * 1024 * 1024, // 1GB
        usedTraffic: 0,
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30天后过期
      });
      
      this.createdUsers.push(user);
    }
    
    console.log(`✅ 创建了 ${count} 个测试用户`);
  }

  async createTestRules(rulesPerUser = 2) {
    console.log(`📋 为每个用户创建 ${rulesPerUser} 个转发规则...`);
    
    for (const user of this.createdUsers) {
      for (let i = 0; i < rulesPerUser; i++) {
        const rule = await UserForwardRule.create({
          userId: user.id,
          name: `${user.username}_rule_${i + 1}`,
          sourcePort: user.portRangeStart + i,
          targetHost: '127.0.0.1',
          targetPort: 3000 + i,
          protocol: 'tcp',
          isActive: true
        });
        
        this.createdRules.push(rule);
      }
    }
    
    console.log(`✅ 创建了 ${this.createdRules.length} 个转发规则`);
  }

  async createExpiredUsers(count = 3) {
    console.log(`⏰ 创建 ${count} 个过期用户...`);
    
    for (let i = 1; i <= count; i++) {
      const user = await User.create({
        username: `expired${i}`,
        password: 'test123',
        role: 'user',
        portRangeStart: 8000 + i * 10,
        portRangeEnd: 8000 + i * 10 + 9,
        trafficQuota: 1024 * 1024 * 1024,
        usedTraffic: 0,
        expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000) // 昨天过期
      });
      
      this.createdUsers.push(user);
    }
    
    console.log(`✅ 创建了 ${count} 个过期用户`);
  }

  async createInactiveUsers(count = 2) {
    console.log(`🚫 创建 ${count} 个非激活用户...`);
    
    for (let i = 1; i <= count; i++) {
      const user = await User.create({
        username: `inactive${i}`,
        password: 'test123',
        role: 'user',
        portRangeStart: 9000 + i * 10,
        portRangeEnd: 9000 + i * 10 + 9,
        trafficQuota: 1024 * 1024 * 1024,
        usedTraffic: 0,
        isActive: false
      });
      
      this.createdUsers.push(user);
    }
    
    console.log(`✅ 创建了 ${count} 个非激活用户`);
  }

  async cleanupTestData() {
    console.log('🧹 清理测试数据...');
    
    // 删除测试用户创建的转发规则
    await UserForwardRule.destroy({
      where: {
        userId: {
          [require('sequelize').Op.in]: this.createdUsers.map(u => u.id)
        }
      }
    });
    
    // 删除测试用户
    const testUsernames = this.createdUsers.map(u => u.username);
    await User.destroy({
      where: {
        username: {
          [require('sequelize').Op.in]: testUsernames
        }
      }
    });
    
    console.log('✅ 测试数据清理完成');
  }

  async generateReport() {
    console.log('\n📊 测试数据报告:');
    console.log('='.repeat(40));
    
    const totalUsers = await User.count();
    const totalRules = await UserForwardRule.count();
    const activeUsers = await User.count({ where: { isActive: true } });
    const expiredUsers = await User.count({
      where: {
        expiryDate: {
          [require('sequelize').Op.lt]: new Date()
        }
      }
    });
    
    console.log(`总用户数: ${totalUsers}`);
    console.log(`激活用户: ${activeUsers}`);
    console.log(`过期用户: ${expiredUsers}`);
    console.log(`转发规则: ${totalRules}`);
    console.log(`本次创建用户: ${this.createdUsers.length}`);
    console.log(`本次创建规则: ${this.createdRules.length}`);
  }

  async run(options = {}) {
    const {
      userCount = 10,
      rulesPerUser = 2,
      expiredUsers = 3,
      inactiveUsers = 2,
      cleanup = false
    } = options;

    console.log('🚀 开始生成测试数据...\n');

    try {
      // 初始化数据库
      await sequelize.authenticate();
      console.log('✅ 数据库连接成功\n');

      if (cleanup) {
        await this.cleanupTestData();
        return;
      }

      // 创建测试用户
      await this.createTestUsers(userCount);

      // 创建转发规则
      await this.createTestRules(rulesPerUser);

      // 创建过期用户
      await this.createExpiredUsers(expiredUsers);

      // 创建非激活用户
      await this.createInactiveUsers(inactiveUsers);

      // 生成报告
      await this.generateReport();

      console.log('\n✅ 测试数据生成完成！');
      console.log('\n💡 提示:');
      console.log('- 运行 "node backend/test-gost-config.js" 测试配置生成性能');
      console.log('- 运行 "node backend/scripts/create-test-data.js --cleanup" 清理测试数据');

    } catch (error) {
      console.error('❌ 测试数据生成失败:', error);
      process.exit(1);
    }
  }
}

// 命令行参数解析
if (require.main === module) {
  const args = process.argv.slice(2);
  const cleanup = args.includes('--cleanup');
  const userCount = parseInt(args.find(arg => arg.startsWith('--users='))?.split('=')[1]) || 10;
  const rulesPerUser = parseInt(args.find(arg => arg.startsWith('--rules='))?.split('=')[1]) || 2;

  const generator = new TestDataGenerator();
  generator.run({ userCount, rulesPerUser, cleanup });
}

module.exports = TestDataGenerator;
