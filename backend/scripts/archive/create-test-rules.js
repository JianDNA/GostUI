/**
 * 创建测试转发规则
 */

async function createTestRules() {
  try {
    const { UserForwardRule } = require('./models');
    const { v4: uuidv4 } = require('uuid');
    
    console.log('🔧 创建测试转发规则...');
    
    // 先检查是否已存在
    const existing = await UserForwardRule.findAll({ 
      where: { isActive: true }
    });
    
    if (existing.length > 0) {
      console.log(`📊 已存在 ${existing.length} 条规则，跳过创建`);
      existing.forEach(rule => {
        console.log(`  规则${rule.id}: 端口${rule.sourcePort} -> 用户${rule.userId}`);
      });
      return;
    }
    
    // 为admin用户创建两个规则
    const rule1 = await UserForwardRule.create({
      userId: 1,
      ruleUUID: uuidv4(),
      name: 'Admin Rule 1',
      sourcePort: 6443,
      targetAddress: '127.0.0.1:8443',
      protocol: 'tcp',
      isActive: true
    });
    console.log(`✅ 创建规则: 端口6443 -> 用户1 (admin)`);

    const rule2 = await UserForwardRule.create({
      userId: 1,
      ruleUUID: uuidv4(),
      name: 'Admin Rule 2', 
      sourcePort: 8080,
      targetAddress: '127.0.0.1:8081',
      protocol: 'tcp',
      isActive: true
    });
    console.log(`✅ 创建规则: 端口8080 -> 用户1 (admin)`);

    // 为test用户创建一个规则
    const rule3 = await UserForwardRule.create({
      userId: 2,
      ruleUUID: uuidv4(),
      name: 'Test Rule 1',
      sourcePort: 2999,
      targetAddress: '127.0.0.1:3000',
      protocol: 'tcp',
      isActive: true
    });
    console.log(`✅ 创建规则: 端口2999 -> 用户2 (test)`);

    console.log('\n✅ 所有测试转发规则创建成功！');
    
  } catch (error) {
    console.error('❌ 创建规则失败:', error.message);
    console.error('详细错误:', error);
  } finally {
    process.exit(0);
  }
}

createTestRules();
