/**
 * 测试admin用户为test用户创建转发规则
 */

const { User, UserForwardRule } = require('./models');
const { portSecurityService } = require('./services/portSecurityService');

async function testAdminCreateRule() {
  try {
    console.log('🧪 测试admin用户为test用户创建6443端口转发规则...\n');
    
    // 1. 获取admin和test用户
    const adminUser = await User.findOne({ where: { username: 'admin' } });
    const testUser = await User.findOne({ where: { username: 'test' } });
    
    if (!adminUser) {
      console.log('❌ admin用户不存在');
      return;
    }
    
    if (!testUser) {
      console.log('❌ test用户不存在');
      return;
    }
    
    console.log('✅ 用户信息:');
    console.log('  - admin用户ID:', adminUser.id, '角色:', adminUser.role);
    console.log('  - test用户ID:', testUser.id, '角色:', testUser.role);
    console.log('  - test用户端口范围:', testUser.portRangeStart, '-', testUser.portRangeEnd);
    console.log('  - test用户额外端口:', testUser.getAdditionalPorts());
    console.log('  - test用户是否过期:', testUser.isExpired());
    console.log('  - test用户状态:', testUser.userStatus);
    
    // 2. 检查6443端口是否已被占用
    console.log('\n🔍 检查6443端口占用情况:');
    const existingRule = await UserForwardRule.findOne({
      where: { sourcePort: 6443 },
      include: [{ model: User, as: 'user' }]
    });
    
    if (existingRule) {
      console.log('  - 6443端口已被占用');
      console.log('  - 占用用户:', existingRule.user?.username);
      console.log('  - 规则名称:', existingRule.name);
      console.log('  - 目标地址:', existingRule.targetAddress);
      
      // 删除现有规则以便测试
      console.log('  - 删除现有规则以便测试...');
      await existingRule.destroy();
      console.log('  - ✅ 现有规则已删除');
    } else {
      console.log('  - 6443端口未被占用');
    }
    
    // 3. 测试端口安全验证（使用admin权限）
    console.log('\n🔒 测试端口安全验证:');
    const portValidation = await portSecurityService.validatePort(6443, 'admin', adminUser.id);
    console.log('  - admin用户6443端口验证结果:', portValidation.valid);
    if (!portValidation.valid) {
      console.log('  - 错误信息:', portValidation.errors);
    }
    if (portValidation.warnings.length > 0) {
      console.log('  - 警告信息:', portValidation.warnings);
    }
    
    // 4. 测试目标地址验证（使用admin权限）
    console.log('\n🎯 测试目标地址验证:');
    const targetValidation = await portSecurityService.validateTargetAddress('127.0.0.1:3000', 'admin');
    console.log('  - admin用户127.0.0.1:3000验证结果:', targetValidation.valid);
    if (!targetValidation.valid) {
      console.log('  - 错误信息:', targetValidation.errors);
    }
    if (targetValidation.warnings.length > 0) {
      console.log('  - 警告信息:', targetValidation.warnings);
    }
    
    // 5. 模拟创建转发规则
    console.log('\n📝 模拟创建转发规则:');
    
    if (portValidation.valid && targetValidation.valid) {
      try {
        const { v4: uuidv4 } = require('uuid');
        const newRule = await UserForwardRule.create({
          userId: testUser.id,  // 为test用户创建
          ruleUUID: uuidv4(),
          name: 'Test 6443 Rule',
          sourcePort: 6443,
          targetAddress: '127.0.0.1:3000',
          protocol: 'tcp',
          description: 'Admin为test用户创建的6443端口转发规则'
        });
        
        console.log('  - ✅ 规则创建成功');
        console.log('  - 规则ID:', newRule.id);
        console.log('  - 规则UUID:', newRule.ruleUUID);
        console.log('  - 用户ID:', newRule.userId);
        console.log('  - 源端口:', newRule.sourcePort);
        console.log('  - 目标地址:', newRule.targetAddress);
        console.log('  - 是否激活:', newRule.isActive);
        
        // 验证规则的计算属性
        await newRule.reload({ include: [{ model: User, as: 'user' }] });
        console.log('  - 计算的isActive:', newRule.getComputedIsActive());
        
      } catch (createError) {
        console.log('  - ❌ 规则创建失败:', createError.message);
      }
    } else {
      console.log('  - ❌ 验证失败，无法创建规则');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

testAdminCreateRule();
