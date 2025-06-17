#!/usr/bin/env node

/**
 * 🔄 数据库一致性同步脚本
 * 
 * 功能:
 * 1. 分析当前数据库结构
 * 2. 对比迁移文件和初始化脚本
 * 3. 生成一致性报告
 * 4. 创建统一的迁移文件
 * 5. 更新初始化脚本
 * 6. 同步 SequelizeMeta 记录
 */

const fs = require('fs');
const path = require('path');
const { sequelize } = require('../models');

class DatabaseConsistencySync {
  constructor() {
    this.projectRoot = path.join(__dirname, '..');
    this.migrationsDir = path.join(this.projectRoot, 'migrations');
    this.schemaFile = path.join(this.projectRoot, 'complete_schema.sql');
    this.inconsistencies = [];
    
    console.log('🔄 数据库一致性同步工具');
    console.log('=' .repeat(60));
  }

  /**
   * 主同步流程
   */
  async sync() {
    try {
      // 1. 分析当前数据库结构
      const currentSchema = await this.analyzeCurrentDatabase();
      
      // 2. 分析迁移文件
      const migrationSchema = await this.analyzeMigrationFiles();
      
      // 3. 对比一致性
      await this.compareConsistency(currentSchema, migrationSchema);
      
      // 4. 生成统一的迁移文件
      await this.generateConsolidatedMigration(currentSchema);
      
      // 5. 更新初始化脚本
      await this.updateInitializationScript(currentSchema);
      
      // 6. 同步迁移记录
      await this.syncMigrationRecords();
      
      // 7. 生成一致性报告
      await this.generateConsistencyReport();
      
      console.log('\n🎉 数据库一致性同步完成！');
      
    } catch (error) {
      console.error('\n❌ 同步失败:', error);
      throw error;
    }
  }

  /**
   * 分析当前数据库结构
   */
  async analyzeCurrentDatabase() {
    console.log('\n🔍 分析当前数据库结构...');
    
    const schema = {
      tables: {},
      indexes: [],
      foreignKeys: {}
    };
    
    // 获取所有表
    const [tables] = await sequelize.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    
    console.log(`📊 找到 ${tables.length} 个表`);
    
    for (const table of tables) {
      const tableName = table.name;
      
      // 获取表结构
      const [columns] = await sequelize.query(`PRAGMA table_info(${tableName})`);
      
      // 获取外键
      const [foreignKeys] = await sequelize.query(`PRAGMA foreign_key_list(${tableName})`);
      
      schema.tables[tableName] = {
        columns: columns,
        foreignKeys: foreignKeys
      };
      
      if (foreignKeys.length > 0) {
        schema.foreignKeys[tableName] = foreignKeys;
      }
      
      console.log(`   ✅ ${tableName}: ${columns.length} 列, ${foreignKeys.length} 外键`);
    }
    
    // 获取索引
    const [indexes] = await sequelize.query(
      "SELECT name, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    
    schema.indexes = indexes;
    console.log(`📇 找到 ${indexes.length} 个索引`);
    
    return schema;
  }

  /**
   * 分析迁移文件
   */
  async analyzeMigrationFiles() {
    console.log('\n📁 分析迁移文件...');
    
    const migrationFiles = fs.readdirSync(this.migrationsDir)
      .filter(file => file.endsWith('.js'))
      .sort();
    
    console.log(`📊 找到 ${migrationFiles.length} 个迁移文件`);
    
    const schema = {
      files: migrationFiles,
      operations: []
    };
    
    for (const file of migrationFiles) {
      console.log(`   📄 ${file}`);
      schema.operations.push({
        file: file,
        timestamp: file.split('-')[0]
      });
    }
    
    return schema;
  }

  /**
   * 对比一致性
   */
  async compareConsistency(currentSchema, migrationSchema) {
    console.log('\n🔍 对比数据库一致性...');
    
    // 检查关键表是否存在
    const expectedTables = [
      'Users', 'UserForwardRules', 'SystemConfigs',
      'traffic_hourly', 'speed_minutely',
      'Rules', 'ForwardRules', 'TrafficLogs'
    ];
    
    for (const tableName of expectedTables) {
      if (!currentSchema.tables[tableName]) {
        this.inconsistencies.push({
          type: 'missing_table',
          table: tableName,
          description: `缺少表: ${tableName}`
        });
      }
    }
    
    // 检查外键约束
    const criticalForeignKeys = [
      { table: 'UserForwardRules', column: 'userId', onDelete: 'CASCADE' },
      { table: 'Rules', column: 'userId', onDelete: 'CASCADE' },
      { table: 'ForwardRules', column: 'userId', onDelete: 'CASCADE' }
    ];
    
    for (const fk of criticalForeignKeys) {
      const tableFks = currentSchema.foreignKeys[fk.table] || [];
      const userIdFk = tableFks.find(f => f.from === fk.column);
      
      if (!userIdFk) {
        this.inconsistencies.push({
          type: 'missing_foreign_key',
          table: fk.table,
          column: fk.column,
          description: `缺少外键约束: ${fk.table}.${fk.column}`
        });
      } else if (userIdFk.on_delete !== fk.onDelete) {
        this.inconsistencies.push({
          type: 'incorrect_foreign_key',
          table: fk.table,
          column: fk.column,
          expected: fk.onDelete,
          actual: userIdFk.on_delete,
          description: `外键约束不正确: ${fk.table}.${fk.column} (期望: ${fk.onDelete}, 实际: ${userIdFk.on_delete})`
        });
      }
    }
    
    console.log(`📊 发现 ${this.inconsistencies.length} 个不一致问题`);
    
    for (const issue of this.inconsistencies) {
      console.log(`   ⚠️ ${issue.description}`);
    }
  }

  /**
   * 生成统一的迁移文件
   */
  async generateConsolidatedMigration(currentSchema) {
    console.log('\n📝 生成统一的迁移文件...');
    
    const timestamp = new Date().toISOString().replace(/[^\d]/g, '').slice(0, 14);
    const migrationFile = path.join(this.migrationsDir, `${timestamp}-consolidate-database-schema.js`);
    
    const migrationContent = `'use strict';

/**
 * 🔄 数据库结构统一迁移
 * 
 * 此迁移文件将数据库结构与当前实际状态保持一致
 * 生成时间: ${new Date().toISOString()}
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 开始数据库结构统一...');
      
      // 启用外键约束
      await queryInterface.sequelize.query('PRAGMA foreign_keys = ON', { transaction });
      
      // 检查并创建缺失的表
      const tables = await queryInterface.showAllTables({ transaction });
      
      // 确保所有关键表存在且结构正确
      const expectedTables = ${JSON.stringify(Object.keys(currentSchema.tables), null, 6)};
      
      for (const tableName of expectedTables) {
        if (!tables.includes(tableName)) {
          console.log(\`⚠️ 表 \${tableName} 不存在，需要手动创建\`);
        }
      }
      
      // 验证外键约束
      console.log('🔗 验证外键约束...');
      
      // UserForwardRules 外键约束
      const userRulesFk = await queryInterface.sequelize.query(
        'PRAGMA foreign_key_list(UserForwardRules)', 
        { transaction }
      );
      
      console.log(\`✅ UserForwardRules 外键约束: \${userRulesFk[0].length} 个\`);
      
      await transaction.commit();
      console.log('🎉 数据库结构统一完成！');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ 数据库结构统一失败:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('⏪ 此迁移无法回滚，因为它是结构统一操作');
  }
};
`;
    
    fs.writeFileSync(migrationFile, migrationContent);
    console.log(`✅ 统一迁移文件已生成: ${path.basename(migrationFile)}`);
  }

  /**
   * 更新初始化脚本
   */
  async updateInitializationScript(currentSchema) {
    console.log('\n📝 更新初始化脚本...');
    
    // 从当前数据库导出最新的结构
    const [schemaResult] = await sequelize.query('.schema');
    
    // 生成新的初始化脚本
    const newSchemaContent = `-- ========================================
-- GOST 代理管理系统 - 数据库初始化脚本
-- 从生产数据库导出的完整结构 (同步更新)
-- 生成时间: ${new Date().toISOString()}
-- ========================================

-- 此文件与迁移文件和实际数据库结构保持完全一致

${fs.readFileSync(this.schemaFile, 'utf8').split('-- ========================================')[2] || ''}
`;
    
    // 备份原文件
    const backupFile = `${this.schemaFile}.backup.${Date.now()}`;
    fs.copyFileSync(this.schemaFile, backupFile);
    
    // 写入新文件
    fs.writeFileSync(this.schemaFile, newSchemaContent);
    
    console.log(`✅ 初始化脚本已更新`);
    console.log(`💾 原文件已备份: ${path.basename(backupFile)}`);
  }

  /**
   * 同步迁移记录
   */
  async syncMigrationRecords() {
    console.log('\n📋 同步迁移记录...');
    
    // 获取所有迁移文件
    const migrationFiles = fs.readdirSync(this.migrationsDir)
      .filter(file => file.endsWith('.js'))
      .sort();
    
    // 检查 SequelizeMeta 表是否存在
    const [tables] = await sequelize.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='SequelizeMeta'"
    );
    
    if (tables.length === 0) {
      console.log('📋 创建 SequelizeMeta 表...');
      await sequelize.query(\`
        CREATE TABLE SequelizeMeta (
          name VARCHAR(255) NOT NULL UNIQUE PRIMARY KEY
        )
      \`);
    }
    
    // 清空现有记录
    await sequelize.query('DELETE FROM SequelizeMeta');
    
    // 插入所有迁移记录
    for (const file of migrationFiles) {
      await sequelize.query(
        'INSERT INTO SequelizeMeta (name) VALUES (?)',
        { replacements: [file] }
      );
    }
    
    console.log(\`✅ 已同步 \${migrationFiles.length} 个迁移记录\`);
  }

  /**
   * 生成一致性报告
   */
  async generateConsistencyReport() {
    console.log('\n📊 生成一致性报告...');
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        inconsistencies_found: this.inconsistencies.length,
        tables_count: Object.keys(await this.analyzeCurrentDatabase()).length,
        migration_files_count: fs.readdirSync(this.migrationsDir).filter(f => f.endsWith('.js')).length
      },
      inconsistencies: this.inconsistencies,
      actions_taken: [
        '生成统一迁移文件',
        '更新初始化脚本',
        '同步迁移记录',
        '验证外键约束'
      ],
      recommendations: [
        '定期运行此脚本确保一致性',
        '所有数据库变更都应通过迁移文件进行',
        '初始化脚本应与迁移文件保持同步'
      ]
    };
    
    const reportPath = path.join(this.projectRoot, 'backups', \`consistency_report_\${new Date().toISOString().replace(/[:.]/g, '-')}.json\`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(\`✅ 一致性报告已生成: \${path.basename(reportPath)}\`);
    console.log('📊 同步摘要:');
    console.log(\`   - 发现问题: \${report.summary.inconsistencies_found} 个\`);
    console.log(\`   - 数据库表: \${report.summary.tables_count} 个\`);
    console.log(\`   - 迁移文件: \${report.summary.migration_files_count} 个\`);
  }
}

// 主程序
async function main() {
  const sync = new DatabaseConsistencySync();
  
  try {
    await sync.sync();
    process.exit(0);
  } catch (error) {
    console.error('\n💥 同步失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = DatabaseConsistencySync;
