#!/usr/bin/env node

/**
 * 单个迁移文件运行器
 * 用于运行特定的迁移文件
 */

const path = require('path');
const fs = require('fs');

async function runSingleMigration(migrationFile) {
  try {
    console.log('🚀 单个迁移运行器');
    console.log('=' .repeat(50));
    console.log(`📁 迁移文件: ${migrationFile}`);
    console.log('');
    
    // 检查迁移文件是否存在
    const migrationPath = path.join(__dirname, 'migrations', migrationFile);
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ 迁移文件不存在: ${migrationPath}`);
      process.exit(1);
    }
    
    // 动态导入数据库连接
    const { sequelize } = require('./models');
    
    // 导入迁移文件
    const migration = require(migrationPath);
    
    // 检查迁移文件格式
    if (!migration.up || typeof migration.up !== 'function') {
      console.error('❌ 迁移文件格式错误：缺少 up 方法');
      process.exit(1);
    }
    
    console.log('🔧 开始执行迁移...');
    
    // 执行迁移
    await migration.up(sequelize.getQueryInterface(), sequelize.Sequelize);
    
    console.log('✅ 迁移执行成功！');
    
    // 记录到 SequelizeMeta 表（如果存在）
    try {
      const tables = await sequelize.getQueryInterface().showAllTables();
      if (tables.includes('SequelizeMeta')) {
        // 检查是否已记录
        const [existing] = await sequelize.query(
          "SELECT COUNT(*) as count FROM SequelizeMeta WHERE name = ?",
          { replacements: [migrationFile] }
        );
        
        if (existing[0].count === 0) {
          await sequelize.query(
            "INSERT INTO SequelizeMeta (name) VALUES (?)",
            { replacements: [migrationFile] }
          );
          console.log('📝 已记录到 SequelizeMeta 表');
        } else {
          console.log('ℹ️ 迁移已在 SequelizeMeta 表中记录');
        }
      }
    } catch (metaError) {
      console.warn('⚠️ 记录到 SequelizeMeta 表失败:', metaError.message);
    }
    
  } catch (error) {
    console.error('❌ 迁移执行失败:', error);
    process.exit(1);
  } finally {
    // 关闭数据库连接
    try {
      const { sequelize } = require('./models');
      await sequelize.close();
    } catch (closeError) {
      console.warn('⚠️ 关闭数据库连接失败:', closeError.message);
    }
  }
}

// 从命令行参数获取迁移文件名
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('❌ 请提供迁移文件名');
  console.log('');
  console.log('使用方法:');
  console.log('  node run-single-migration.js <migration-file>');
  console.log('');
  console.log('示例:');
  console.log('  node run-single-migration.js 20250617063000-add-user-external-access-config.js');
  process.exit(1);
}

// 运行迁移
runSingleMigration(migrationFile);
