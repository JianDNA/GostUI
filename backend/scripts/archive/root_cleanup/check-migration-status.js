/**
 * 检查和修复迁移状态
 */

const { sequelize } = require('./models');

async function checkMigrationStatus() {
  try {
    console.log('🔍 检查迁移状态...\n');
    
    // 检查 SequelizeMeta 表
    const tables = await sequelize.getQueryInterface().showAllTables();
    console.log('📊 数据库表:', tables.join(', '));
    
    if (tables.includes('SequelizeMeta')) {
      const [migrations] = await sequelize.query('SELECT * FROM SequelizeMeta ORDER BY name');
      console.log('\n📋 已执行的迁移:');
      migrations.forEach(migration => {
        console.log(`  ✅ ${migration.name}`);
      });
      
      // 检查是否有我们的修复迁移
      const fixMigration = migrations.find(m => m.name === '20250609000001-fix-user-forward-rules-constraints.js');
      if (fixMigration) {
        console.log('\n⚠️ 修复迁移已经被记录为执行过，但可能没有实际执行');
        console.log('建议：删除这条记录并重新执行迁移');
        
        // 删除错误的迁移记录
        await sequelize.query("DELETE FROM SequelizeMeta WHERE name = '20250609000001-fix-user-forward-rules-constraints.js'");
        console.log('✅ 已删除错误的迁移记录');
      } else {
        console.log('\n✅ 修复迁移尚未执行');
      }
    } else {
      console.log('\n⚠️ SequelizeMeta 表不存在');
    }
    
    // 检查 UserForwardRules 表结构
    if (tables.includes('UserForwardRules')) {
      console.log('\n📋 检查 UserForwardRules 表结构...');
      const tableDescription = await sequelize.getQueryInterface().describeTable('UserForwardRules');
      console.log('当前字段:', Object.keys(tableDescription).join(', '));
      
      // 检查是否有错误的约束
      const [indexes] = await sequelize.query("PRAGMA index_list(UserForwardRules)");
      console.log('当前索引:');
      for (const index of indexes) {
        const [indexInfo] = await sequelize.query(`PRAGMA index_info(${index.name})`);
        const fields = indexInfo.map(info => info.name).join(', ');
        console.log(`  ${index.name}: ${fields} (unique: ${index.unique})`);
      }
    }
    
  } catch (error) {
    console.error('❌ 检查迁移状态失败:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

checkMigrationStatus();
