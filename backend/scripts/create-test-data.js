/**
 * 测试数据生成脚本
 * 用于创建大量测试用户和转发规则，以便进行性能测试
 *
 * ⚠️ 安全警告: 此脚本仅用于开发和测试环境，禁止在生产环境中运行！
 * ⚠️ 此脚本会修改数据库数据，可能造成数据丢失！
 */

// 🔒 生产环境安全检查
function checkProductionSafety() {
  const env = process.env.NODE_ENV || 'development';

  if (env === 'production') {
    console.error('🚨 严重安全警告: 此脚本禁止在生产环境中运行！');
    console.error('   当前环境: production');
    console.error('   此脚本会创建/删除大量测试数据，可能导致生产数据丢失！');
    console.error('   请在开发或测试环境中运行此脚本。');
    process.exit(1);
  }

  // 额外检查生产环境特征
  const productionIndicators = [
    process.env.PM2_HOME,
    process.env.PRODUCTION,
    process.env.PROD,
    process.env.DATABASE_URL // 生产数据库连接
  ];

  if (productionIndicators.some(indicator => indicator)) {
    console.error('🚨 严重安全警告: 检测到生产环境特征，拒绝运行测试脚本！');
    console.error('   此操作可能导致生产数据丢失！');
    process.exit(1);
  }

  console.log(`✅ 环境安全检查通过 (当前环境: ${env})`);
}

const { initDb, models } = require('../services/dbService');
const { User, UserForwardRule } = models;

class TestDataGenerator {
  constructor() {
    this.users = [];
    this.rules = [];
  }

  /**
   * 生成随机字符串
   */
  generateRandomString(length = 8) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * 生成随机端口
   */
  generateRandomPort(min = 10001, max = 65535) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * 生成随机 IP 地址
   */
  generateRandomIP() {
    return `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  }

  /**
   * 生成随机协议
   */
  generateRandomProtocol() {
    const protocols = ['tcp', 'udp', 'tls'];
    return protocols[Math.floor(Math.random() * protocols.length)];
  }

  /**
   * 创建测试用户
   */
  async createTestUsers(count = 50) {
    console.log(`创建 ${count} 个测试用户...`);

    for (let i = 0; i < count; i++) {
      const username = `testuser_${this.generateRandomString(6)}`;
      const email = `${username}@test.com`;
      const portStart = this.generateRandomPort(10001, 50000);
      const portEnd = portStart + Math.floor(Math.random() * 100) + 10; // 10-110 个端口范围

      try {
        const user = await User.create({
          username,
          email,
          password: 'test123456',
          role: 'user',
          isActive: true,
          portRangeStart: portStart,
          portRangeEnd: Math.min(portEnd, 65535),
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天后过期
          trafficQuota: Math.floor(Math.random() * 1000) + 100 // 100-1100GB
        });

        this.users.push(user);

        if ((i + 1) % 10 === 0) {
          console.log(`已创建 ${i + 1} 个用户`);
        }
      } catch (error) {
        console.error(`创建用户 ${username} 失败:`, error.message);
      }
    }

    console.log(`✅ 成功创建 ${this.users.length} 个测试用户`);
  }

  /**
   * 为用户创建转发规则
   */
  async createTestRules(rulesPerUser = 5) {
    console.log(`为每个用户创建 ${rulesPerUser} 个转发规则...`);

    let totalRules = 0;

    for (const user of this.users) {
      const usedPorts = new Set();

      for (let i = 0; i < rulesPerUser; i++) {
        let sourcePort;
        let attempts = 0;

        // 尝试生成一个在用户端口范围内且未使用的端口
        do {
          sourcePort = this.generateRandomPort(user.portRangeStart, user.portRangeEnd);
          attempts++;
        } while (usedPorts.has(sourcePort) && attempts < 50);

        if (attempts >= 50) {
          console.warn(`用户 ${user.username} 的端口范围已满，跳过剩余规则`);
          break;
        }

        usedPorts.add(sourcePort);

        const targetIP = this.generateRandomIP();
        const targetPort = this.generateRandomPort(80, 8080);
        const protocol = this.generateRandomProtocol();
        const ruleName = `${user.username}_rule_${i + 1}`;

        try {
          const rule = await UserForwardRule.create({
            userId: user.id,
            name: ruleName,
            sourcePort,
            targetAddress: `${targetIP}:${targetPort}`,
            protocol,
            isActive: Math.random() > 0.2, // 80% 的规则是激活的
            description: `测试规则 - ${protocol.toUpperCase()} 转发到 ${targetIP}:${targetPort}`
          });

          this.rules.push(rule);
          totalRules++;
        } catch (error) {
          console.error(`创建规则 ${ruleName} 失败:`, error.message);
        }
      }

      if (totalRules % 50 === 0) {
        console.log(`已创建 ${totalRules} 个规则`);
      }
    }

    console.log(`✅ 成功创建 ${totalRules} 个测试规则`);
  }

  /**
   * 创建一些过期用户（用于测试过期用户过滤）
   */
  async createExpiredUsers(count = 10) {
    console.log(`创建 ${count} 个过期用户...`);

    for (let i = 0; i < count; i++) {
      const username = `expired_${this.generateRandomString(6)}`;
      const email = `${username}@test.com`;

      try {
        await User.create({
          username,
          email,
          password: 'test123456',
          role: 'user',
          isActive: true,
          portRangeStart: this.generateRandomPort(10001, 20000),
          portRangeEnd: this.generateRandomPort(20001, 30000),
          expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // 昨天过期
          trafficQuota: 100
        });
      } catch (error) {
        console.error(`创建过期用户 ${username} 失败:`, error.message);
      }
    }

    console.log(`✅ 成功创建 ${count} 个过期用户`);
  }

  /**
   * 创建一些非激活用户
   */
  async createInactiveUsers(count = 5) {
    console.log(`创建 ${count} 个非激活用户...`);

    for (let i = 0; i < count; i++) {
      const username = `inactive_${this.generateRandomString(6)}`;
      const email = `${username}@test.com`;

      try {
        await User.create({
          username,
          email,
          password: 'test123456',
          role: 'user',
          isActive: false, // 非激活状态
          portRangeStart: this.generateRandomPort(10001, 20000),
          portRangeEnd: this.generateRandomPort(20001, 30000),
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          trafficQuota: 100
        });
      } catch (error) {
        console.error(`创建非激活用户 ${username} 失败:`, error.message);
      }
    }

    console.log(`✅ 成功创建 ${count} 个非激活用户`);
  }

  /**
   * 清理所有测试数据
   */
  async cleanupTestData() {
    console.log('清理测试数据...');

    try {
      // 删除测试用户（会级联删除相关规则）
      const deletedUsers = await User.destroy({
        where: {
          username: {
            [require('sequelize').Op.like]: 'testuser_%'
          }
        }
      });

      const deletedExpired = await User.destroy({
        where: {
          username: {
            [require('sequelize').Op.like]: 'expired_%'
          }
        }
      });

      const deletedInactive = await User.destroy({
        where: {
          username: {
            [require('sequelize').Op.like]: 'inactive_%'
          }
        }
      });

      console.log(`✅ 清理完成:`);
      console.log(`   - 删除测试用户: ${deletedUsers}`);
      console.log(`   - 删除过期用户: ${deletedExpired}`);
      console.log(`   - 删除非激活用户: ${deletedInactive}`);
    } catch (error) {
      console.error('清理测试数据失败:', error);
    }
  }

  /**
   * 生成测试报告
   */
  async generateReport() {
    try {
      const totalUsers = await User.count();
      const activeUsers = await User.count({ where: { isActive: true } });
      const totalRules = await UserForwardRule.count();
      const activeRules = await UserForwardRule.count({ where: { isActive: true } });

      console.log('\n📊 测试数据统计报告:');
      console.log('='.repeat(40));
      console.log(`总用户数: ${totalUsers}`);
      console.log(`激活用户数: ${activeUsers}`);
      console.log(`总规则数: ${totalRules}`);
      console.log(`激活规则数: ${activeRules}`);
      console.log('='.repeat(40));
    } catch (error) {
      console.error('生成报告失败:', error);
    }
  }

  /**
   * 运行完整的测试数据生成流程
   */
  async run(options = {}) {
    // 🔒 首先进行安全检查
    checkProductionSafety();

    const {
      userCount = 50,
      rulesPerUser = 5,
      expiredUsers = 10,
      inactiveUsers = 5,
      cleanup = false
    } = options;

    console.log('🚀 开始生成测试数据...\n');

    try {
      // 初始化数据库
      await initDb();

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

// 命令行参数处理
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};

  // 解析命令行参数
  args.forEach(arg => {
    if (arg === '--cleanup') {
      options.cleanup = true;
    } else if (arg.startsWith('--users=')) {
      options.userCount = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--rules=')) {
      options.rulesPerUser = parseInt(arg.split('=')[1]);
    }
  });

  const generator = new TestDataGenerator();
  generator.run(options)
    .then(() => {
      console.log('\n程序执行完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('程序执行失败:', error);
      process.exit(1);
    });
}

module.exports = TestDataGenerator;
