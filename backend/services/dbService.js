const { sequelize, User } = require('../models');
const fs = require('fs');
const path = require('path');

// 创建数据库目录（如果不存在）
const dbDir = path.join(__dirname, '../database');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 导入其他模型
const models = require('../models');

/**
 * 初始化数据库
 */
const initDb = async () => {
  try {
    // 测试连接
    await sequelize.authenticate();
    console.log('数据库连接成功');
    
    // 同步模型（不强制重建表）
    await sequelize.sync({ alter: false });
    console.log('数据库模型同步完成');

    // 检查是否已存在管理员用户
    const adminCount = await models.User.count({ where: { role: 'admin' } });
    if (adminCount === 0) {
      // 创建管理员用户
      await models.User.create({
        username: 'admin',
        password: 'admin123',
        email: 'admin@example.com',
        role: 'admin',
        isActive: true
      });
      console.log('创建管理员用户成功');
    }

    return true;
  } catch (error) {
    console.error('数据库初始化错误:', error);
    return false;
  }
};

module.exports = {
  sequelize,
  models,
  initDb
}; 