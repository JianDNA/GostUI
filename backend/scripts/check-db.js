/**
 * 数据库检查脚本
 */

const { sequelize, models } = require('../services/dbService');

async function checkDatabase() {
  try {
    console.log('🔍 开始检查数据库...\n');
    
    // 测试数据库连接
    await sequelize.authenticate();
    console.log('✅ 数据库连接成功');
    
    // 检查表结构
    const tables = await sequelize.getQueryInterface().showAllTables();
    console.log('📋 数据库表:', tables);
    
    // 检查用户表
    if (models.User) {
      const userCount = await models.User.count();
      console.log(`👥 用户数量: ${userCount}`);
    }
    
    // 检查转发规则表
    if (models.UserForwardRule) {
      const ruleCount = await models.UserForwardRule.count();
      console.log(`📋 转发规则数量: ${ruleCount}`);
    }
    
    console.log('\n✅ 数据库检查完成');
    
  } catch (error) {
    console.error('❌ 数据库检查失败:', error);
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  checkDatabase();
}

module.exports = checkDatabase;
