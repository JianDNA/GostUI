/**
 * 修复表约束问题
 */

const { sequelize } = require('./models');

async function fixTableConstraints() {
  try {
    console.log('🔧 开始修复表约束...\n');
    
    // 检查当前表结构
    console.log('1. 检查当前表结构...');
    const [tableInfo] = await sequelize.query("PRAGMA table_info(UserForwardRules)");
    console.log('当前字段:', tableInfo.map(f => f.name).join(', '));
    
    // 检查索引
    const [indexes] = await sequelize.query("PRAGMA index_list(UserForwardRules)");
    console.log('当前索引:', indexes.map(i => `${i.name}(unique:${i.unique})`).join(', '));
    
    // 获取所有数据
    console.log('\n2. 备份现有数据...');
    const [existingData] = await sequelize.query("SELECT * FROM UserForwardRules");
    console.log(`找到 ${existingData.length} 条现有记录`);
    
    // 重建表（移除错误的约束）
    console.log('\n3. 重建表结构...');
    
    await sequelize.transaction(async (t) => {
      // 创建临时表
      await sequelize.query(`
        CREATE TABLE UserForwardRules_temp (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER NOT NULL,
          ruleUUID VARCHAR(36) NOT NULL UNIQUE,
          name VARCHAR(100) NOT NULL,
          sourcePort INTEGER NOT NULL UNIQUE,
          targetAddress VARCHAR(255) NOT NULL,
          protocol VARCHAR(10) NOT NULL DEFAULT 'tcp',
          isActive BOOLEAN NOT NULL DEFAULT 1,
          description TEXT,
          usedTraffic BIGINT NOT NULL DEFAULT 0,
          createdAt DATETIME NOT NULL,
          updatedAt DATETIME NOT NULL,
          FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
        )
      `, { transaction: t });
      
      // 复制数据到临时表
      if (existingData.length > 0) {
        console.log('4. 复制数据到临时表...');
        for (const row of existingData) {
          await sequelize.query(`
            INSERT INTO UserForwardRules_temp 
            (id, userId, ruleUUID, name, sourcePort, targetAddress, protocol, isActive, description, usedTraffic, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, {
            replacements: [
              row.id,
              row.userId,
              row.ruleUUID || require('uuid').v4(), // 如果没有UUID，生成一个
              row.name,
              row.sourcePort,
              row.targetAddress,
              row.protocol || 'tcp',
              row.isActive !== undefined ? row.isActive : 1,
              row.description,
              row.usedTraffic || 0,
              row.createdAt,
              row.updatedAt
            ],
            transaction: t
          });
        }
      }
      
      // 删除原表
      console.log('5. 删除原表...');
      await sequelize.query('DROP TABLE UserForwardRules', { transaction: t });
      
      // 重命名临时表
      console.log('6. 重命名临时表...');
      await sequelize.query('ALTER TABLE UserForwardRules_temp RENAME TO UserForwardRules', { transaction: t });
      
      // 创建索引
      console.log('7. 创建索引...');
      await sequelize.query('CREATE INDEX idx_user_forward_rules_user_id ON UserForwardRules(userId)', { transaction: t });
    });
    
    console.log('\n✅ 表约束修复完成！');
    
    // 验证修复结果
    console.log('\n8. 验证修复结果...');
    const [newTableInfo] = await sequelize.query("PRAGMA table_info(UserForwardRules)");
    console.log('新字段:', newTableInfo.map(f => f.name).join(', '));
    
    const [newIndexes] = await sequelize.query("PRAGMA index_list(UserForwardRules)");
    console.log('新索引:', newIndexes.map(i => `${i.name}(unique:${i.unique})`).join(', '));
    
    const [finalData] = await sequelize.query("SELECT COUNT(*) as count FROM UserForwardRules");
    console.log(`数据记录: ${finalData[0].count} 条`);
    
  } catch (error) {
    console.error('❌ 修复表约束失败:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

fixTableConstraints();
