/**
 * 检查转发规则
 */

async function checkRules() {
  try {
    const { UserForwardRule } = require('./models');
    
    console.log('🔍 检查数据库中的转发规则...');
    
    const rules = await UserForwardRule.findAll({ 
      where: { isActive: true },
      attributes: ['id', 'name', 'sourcePort', 'userId', 'isActive']
    });
    
    console.log(`📊 找到 ${rules.length} 条活跃转发规则:`);
    
    if (rules.length === 0) {
      console.log('❌ 没有活跃的转发规则！这就是问题所在！');
    } else {
      rules.forEach(rule => {
        console.log(`  规则${rule.id}: 端口${rule.sourcePort} -> 用户${rule.userId} (${rule.name})`);
      });
    }
    
  } catch (error) {
    console.error('❌ 检查规则失败:', error.message);
  } finally {
    process.exit(0);
  }
}

checkRules();
