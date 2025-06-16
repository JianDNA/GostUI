/**
 * 检查数据库表结构
 */

const { sequelize } = require('./models');

async function checkTableStructure() {
  try {
    console.log('🔍 检查 UserForwardRules 表结构...\n');
    
    // 获取表结构
    const [results] = await sequelize.query("PRAGMA table_info(UserForwardRules)");
    
    console.log('📊 表字段信息:');
    results.forEach(field => {
      console.log(`  ${field.name}: ${field.type} ${field.notnull ? 'NOT NULL' : 'NULL'} ${field.pk ? 'PRIMARY KEY' : ''} ${field.dflt_value ? `DEFAULT ${field.dflt_value}` : ''}`);
    });
    
    // 获取索引信息
    const [indexes] = await sequelize.query("PRAGMA index_list(UserForwardRules)");
    
    console.log('\n📊 表索引信息:');
    for (const index of indexes) {
      console.log(`  索引: ${index.name} (unique: ${index.unique})`);
      
      // 获取索引详细信息
      const [indexInfo] = await sequelize.query(`PRAGMA index_info(${index.name})`);
      const fields = indexInfo.map(info => info.name).join(', ');
      console.log(`    字段: ${fields}`);
    }
    
    // 获取外键信息
    const [foreignKeys] = await sequelize.query("PRAGMA foreign_key_list(UserForwardRules)");
    
    if (foreignKeys.length > 0) {
      console.log('\n📊 外键信息:');
      foreignKeys.forEach(fk => {
        console.log(`  ${fk.from} -> ${fk.table}.${fk.to}`);
      });
    }
    
  } catch (error) {
    console.error('❌ 检查表结构失败:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

checkTableStructure();
