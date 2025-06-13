/**
 * 测试关联查询
 */

async function testAssociation() {
  try {
    const { UserForwardRule, User } = require('./models');
    
    console.log('🔍 测试关联查询...');
    
    // 测试关联查询
    const rules = await UserForwardRule.findAll({
      where: { isActive: true },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'expiryDate']
      }]
    });
    
    console.log(`📊 关联查询结果: ${rules.length} 条规则`);
    
    if (rules.length === 0) {
      console.log('❌ 关联查询没有返回任何结果');
    } else {
      rules.forEach(rule => {
        console.log(`  规则${rule.id}: 端口${rule.sourcePort}`);
        if (rule.user) {
          console.log(`    ✅ 用户: ${rule.user.username} (ID:${rule.user.id})`);
          console.log(`    过期时间: ${rule.user.expiryDate || '无'}`);
        } else {
          console.log(`    ❌ 没有关联用户数据`);
        }
      });
    }
    
    // 也测试分别查询的方式
    console.log('\n🔍 测试分别查询...');
    
    const rulesOnly = await UserForwardRule.findAll({
      where: { isActive: true },
      attributes: ['id', 'name', 'sourcePort', 'userId']
    });
    
    console.log(`📊 规则查询结果: ${rulesOnly.length} 条`);
    
    if (rulesOnly.length > 0) {
      const userIds = [...new Set(rulesOnly.map(rule => rule.userId))];
      console.log(`📊 涉及用户ID: ${userIds.join(', ')}`);
      
      const users = await User.findAll({
        where: { id: userIds },
        attributes: ['id', 'username', 'expiryDate']
      });
      
      console.log(`📊 用户查询结果: ${users.length} 个用户`);
      
      rulesOnly.forEach(rule => {
        const user = users.find(u => u.id === rule.userId);
        console.log(`  规则${rule.id}: 端口${rule.sourcePort} -> 用户${rule.userId}`);
        if (user) {
          console.log(`    ✅ 用户: ${user.username}`);
        } else {
          console.log(`    ❌ 找不到用户${rule.userId}`);
        }
      });
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('详细错误:', error);
  } finally {
    process.exit(0);
  }
}

testAssociation();
