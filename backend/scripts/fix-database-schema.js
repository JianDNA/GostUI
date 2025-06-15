/**
 * 修复数据库架构 - 移除 UserForwardRules 表中的 isActive 列
 */

const { sequelize } = require('../services/dbService');

async function fixDatabaseSchema() {
  try {
    console.log('🔧 开始修复数据库架构...');
    
    // 检查表结构
    const [results] = await sequelize.query("PRAGMA table_info(UserForwardRules)");
    console.log('📋 当前 UserForwardRules 表结构:');
    results.forEach(column => {
      console.log(`   - ${column.name}: ${column.type} (nullable: ${column.notnull === 0})`);
    });
    
    // 检查是否存在 isActive 列
    const hasIsActiveColumn = results.some(column => column.name === 'isActive');
    
    if (hasIsActiveColumn) {
      console.log('🔧 发现 isActive 列，开始移除...');
      
      // SQLite 不支持直接删除列，需要重建表
      await sequelize.transaction(async (transaction) => {
        // 1. 创建新表（不包含 isActive 列）
        await sequelize.query(`
          CREATE TABLE UserForwardRules_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            ruleUUID VARCHAR(36) NOT NULL UNIQUE,
            name VARCHAR(100) NOT NULL,
            sourcePort INTEGER NOT NULL UNIQUE,
            targetAddress VARCHAR(255) NOT NULL,
            protocol VARCHAR(10) NOT NULL DEFAULT 'tcp',
            description TEXT,
            usedTraffic BIGINT NOT NULL DEFAULT 0,
            listenAddress VARCHAR(45) DEFAULT '127.0.0.1',
            listenAddressType VARCHAR(10) NOT NULL DEFAULT 'ipv4',
            createdAt DATETIME NOT NULL,
            updatedAt DATETIME NOT NULL,
            FOREIGN KEY (userId) REFERENCES Users(id)
          )
        `, { transaction });
        
        // 2. 复制数据（排除 isActive 列）
        await sequelize.query(`
          INSERT INTO UserForwardRules_new (
            id, userId, ruleUUID, name, sourcePort, targetAddress, 
            protocol, description, usedTraffic, listenAddress, 
            listenAddressType, createdAt, updatedAt
          )
          SELECT 
            id, userId, ruleUUID, name, sourcePort, targetAddress, 
            protocol, description, usedTraffic, listenAddress, 
            listenAddressType, createdAt, updatedAt
          FROM UserForwardRules
        `, { transaction });
        
        // 3. 删除旧表
        await sequelize.query('DROP TABLE UserForwardRules', { transaction });
        
        // 4. 重命名新表
        await sequelize.query('ALTER TABLE UserForwardRules_new RENAME TO UserForwardRules', { transaction });
        
        // 5. 重建索引
        await sequelize.query(`
          CREATE INDEX idx_user_forward_rules_user_id ON UserForwardRules(userId)
        `, { transaction });
      });
      
      console.log('✅ 成功移除 isActive 列');
    } else {
      console.log('✅ isActive 列不存在，无需修复');
    }
    
    // 验证修复结果
    const [newResults] = await sequelize.query("PRAGMA table_info(UserForwardRules)");
    console.log('📋 修复后的 UserForwardRules 表结构:');
    newResults.forEach(column => {
      console.log(`   - ${column.name}: ${column.type} (nullable: ${column.notnull === 0})`);
    });
    
    console.log('🎉 数据库架构修复完成！');
    
  } catch (error) {
    console.error('❌ 修复数据库架构失败:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// 运行修复
if (require.main === module) {
  fixDatabaseSchema()
    .then(() => {
      console.log('✅ 脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { fixDatabaseSchema };
