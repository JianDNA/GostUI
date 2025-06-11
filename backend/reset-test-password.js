#!/usr/bin/env node

/**
 * 重置test用户密码的脚本
 * 使用方法: node reset-test-password.js [新密码]
 */

const bcrypt = require('bcrypt');
const { User } = require('./models');

async function resetTestPassword() {
  try {
    console.log('🔑 开始重置test用户密码...');
    
    // 获取命令行参数中的新密码，默认为 'test123'
    const newPassword = process.argv[2] || 'test123';
    
    // 查找test用户
    const testUser = await User.findOne({ where: { username: 'test' } });
    if (!testUser) {
      console.log('❌ 未找到test用户');
      console.log('请确保数据库中存在用户名为 "test" 的用户');
      process.exit(1);
    }
    
    console.log(`✅ 找到test用户 (ID: ${testUser.id})`);
    
    // 生成新密码的哈希
    console.log('🔐 生成密码哈希...');
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    // 更新用户密码
    console.log('💾 更新数据库...');
    await testUser.update({ password: hashedPassword });
    
    console.log('');
    console.log('🎉 密码重置成功！');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 登录信息:');
    console.log(`   用户名: test`);
    console.log(`   密码: ${newPassword}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('现在您可以使用上述凭据登录系统了！');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ 重置密码失败:', error.message);
    console.error('详细错误:', error);
    process.exit(1);
  }
}

// 运行脚本
resetTestPassword();
