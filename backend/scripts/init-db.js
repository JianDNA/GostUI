const { sequelize, User } = require('../models');
const bcrypt = require('bcryptjs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function initDatabase() {
  try {
    // 运行所有迁移
    console.log('正在运行数据库迁移...');
    await execPromise('npx sequelize-cli db:migrate');
    console.log('数据库迁移完成');

    // 创建默认管理员用户
    const admin = await User.create({
      username: 'admin',
      password: 'admin123',
      email: 'admin@example.com',
      role: 'admin',
      isActive: true,
      trafficQuota: null  // 管理员无流量限制
    });
    console.log('默认管理员用户已创建');

    // 验证密码是否正确
    console.log('正在验证密码...');
    const isValid = await admin.comparePassword('admin123');
    if (isValid) {
      console.log('密码验证成功！');
      console.log('登录凭据:');
      console.log('用户名: admin');
      console.log('密码: admin123');
    } else {
      console.error('警告：密码验证失败！');
      console.log('存储的密码哈希:', admin.password);
      
      // 额外测试：直接使用 bcrypt 比较
      const directCompare = await bcrypt.compare('admin123', admin.password);
      console.log('直接使用 bcrypt 比较结果:', directCompare ? '成功' : '失败');
    }

    // 测试从数据库查询用户
    const foundUser = await User.findOne({ where: { username: 'admin' } });
    if (foundUser) {
      console.log('成功从数据库查询到用户');
      const verifyPassword = await foundUser.comparePassword('admin123');
      console.log('数据库查询用户密码验证:', verifyPassword ? '成功' : '失败');
    } else {
      console.error('错误：无法从数据库查询到用户！');
    }

    console.log('数据库初始化完成');
    process.exit(0);
  } catch (error) {
    console.error('数据库初始化失败:', error);
    console.error('错误详情:', error.stack);
    process.exit(1);
  }
}

initDatabase(); 