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
    
    // 直接使用明文密码，让模型自动加密
    console.log('💾 更新数据库...');
    await testUser.update({ password: newPassword });

    // 验证密码是否正确设置
    console.log('🔍 验证新密码...');
    const updatedUser = await User.findOne({ where: { username: 'test' } });
    const isValid = await updatedUser.comparePassword(newPassword);

    if (isValid) {
      console.log('');
      console.log('🎉 密码重置成功！');
    } else {
      console.log('❌ 密码验证失败，请检查设置');
      process.exit(1);
    }
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
