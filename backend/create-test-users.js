/**
 * 创建测试用户脚本
 */

const { User, UserForwardRule } = require('./models');
const { v4: uuidv4 } = require('uuid');

async function createTestUsers() {
  try {
    console.log('🔄 开始创建测试用户...');

    // 检查是否已有admin用户
    const existingAdmin = await User.findOne({ where: { username: 'admin' } });
    if (!existingAdmin) {
      // 创建admin用户
      const adminUser = await User.create({
        username: 'admin',
        password: 'admin123', // 注意：在实际应用中应该加密
        email: 'admin@example.com',
        role: 'admin',
        portRangeStart: 6000,
        portRangeEnd: 7000,
        isActive: true,
        trafficQuota: null, // 无限制
        usedTraffic: 0,
        userStatus: 'active'
      });
      console.log('✅ Admin用户创建成功:', adminUser.username);
    } else {
      console.log('⏭️ Admin用户已存在，跳过创建');
    }

    // 检查是否已有test用户
    const existingTest = await User.findOne({ where: { username: 'test' } });
    if (!existingTest) {
      // 创建test用户
      const testUser = await User.create({
        username: 'test',
        password: 'test123',
        email: 'test@example.com',
        role: 'user',
        portRangeStart: 2000,
        portRangeEnd: 3000,
        isActive: true,
        trafficQuota: 100, // 100GB限制
        usedTraffic: 0,
        userStatus: 'active'
      });
      console.log('✅ Test用户创建成功:', testUser.username);
    } else {
      console.log('⏭️ Test用户已存在，跳过创建');
    }

    // 🔧 创建测试用的端口转发规则
    console.log('\n🔄 创建端口转发规则...');

    // 获取用户ID
    const adminUser = await User.findOne({ where: { username: 'admin' } });
    const testUser = await User.findOne({ where: { username: 'test' } });

    if (adminUser && testUser) {
      // 🔧 为admin用户创建端口6443和8080的规则（包含所有必需字段）
      const adminRules = [
        {
          userId: adminUser.id,
          ruleUUID: uuidv4(),  // 🔧 添加必需的 ruleUUID 字段
          name: 'Admin HTTPS Proxy',
          sourcePort: 6443,
          targetAddress: '1.1.1.1:443',
          protocol: 'tcp',
          isActive: true,
          description: '管理员HTTPS代理规则',
          usedTraffic: 0
        },
        {
          userId: adminUser.id,
          ruleUUID: uuidv4(),  // 🔧 添加必需的 ruleUUID 字段
          name: 'Admin HTTP Proxy',
          sourcePort: 8080,
          targetAddress: '1.1.1.1:80',
          protocol: 'tcp',
          isActive: true,
          description: '管理员HTTP代理规则',
          usedTraffic: 0
        }
      ];

      // 🔧 为test用户创建端口2999的规则（包含所有必需字段）
      const testRules = [
        {
          userId: testUser.id,
          ruleUUID: uuidv4(),  // 🔧 添加必需的 ruleUUID 字段
          name: 'Test HTTPS Proxy',
          sourcePort: 2999,
          targetAddress: '1.1.1.1:443',
          protocol: 'tcp',
          isActive: true,
          description: '测试用户HTTPS代理规则',
          usedTraffic: 0
        }
      ];

      // 创建规则（如果不存在）
      for (const rule of [...adminRules, ...testRules]) {
        const existingRule = await UserForwardRule.findOne({
          where: { userId: rule.userId, sourcePort: rule.sourcePort }
        });

        if (!existingRule) {
          await UserForwardRule.create(rule);
          console.log(`✅ 创建规则: 用户${rule.userId} 端口${rule.sourcePort} -> ${rule.targetHost}:${rule.targetPort}`);
        } else {
          console.log(`⏭️ 规则已存在: 用户${rule.userId} 端口${rule.sourcePort}`);
        }
      }
    }

    // 显示所有用户和规则
    const allUsers = await User.findAll({
      attributes: ['id', 'username', 'role', 'portRangeStart', 'portRangeEnd', 'trafficQuota', 'usedTraffic', 'userStatus']
    });

    console.log('\n📊 当前用户列表:');
    allUsers.forEach(user => {
      console.log(`  ${user.id}: ${user.username} (${user.role}) - 端口${user.portRangeStart}-${user.portRangeEnd}, 流量${user.usedTraffic}/${user.trafficQuota || '无限制'}GB`);
    });

    // 显示所有转发规则
    const allRules = await UserForwardRule.findAll({
      attributes: ['id', 'userId', 'name', 'sourcePort', 'targetAddress', 'protocol', 'isActive', 'usedTraffic']
    });

    console.log('\n📊 当前转发规则:');
    allRules.forEach(rule => {
      console.log(`  规则${rule.id}: ${rule.name} - 用户${rule.userId} 端口${rule.sourcePort} -> ${rule.targetAddress} (${rule.protocol}) 流量${rule.usedTraffic}B`);
    });

    console.log('\n🎉 测试用户和规则创建完成！');

  } catch (error) {
    console.error('❌ 创建测试用户失败:', error);
  } finally {
    process.exit(0);
  }
}

createTestUsers();
