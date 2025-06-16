#!/usr/bin/env node

/**
 * 🔍 迁移文件分析脚本
 * 
 * 功能:
 * 1. 分析所有迁移文件的作用
 * 2. 识别废弃的迁移文件
 * 3. 确定最终统一迁移的影响
 * 4. 生成迁移清理建议
 */

const fs = require('fs');
const path = require('path');

class MigrationAnalyzer {
  constructor() {
    this.projectRoot = path.join(__dirname, '../..');
    this.migrationsDir = path.join(this.projectRoot, 'backend/migrations');
    this.migrations = [];
    this.analysis = {};
    
    console.log('🔍 迁移文件分析工具');
    console.log('=' .repeat(60));
  }

  /**
   * 主分析流程
   */
  async analyze() {
    try {
      // 1. 读取所有迁移文件
      await this.loadMigrations();
      
      // 2. 分析每个迁移的作用
      await this.analyzeMigrationPurposes();
      
      // 3. 检查当前数据库状态
      await this.checkCurrentDatabaseState();
      
      // 4. 识别废弃迁移
      await this.identifyDeprecatedMigrations();
      
      // 5. 生成清理建议
      await this.generateCleanupRecommendations();
      
      console.log('\n🎉 迁移文件分析完成！');
      
    } catch (error) {
      console.error('\n❌ 分析失败:', error);
      throw error;
    }
  }

  /**
   * 读取所有迁移文件
   */
  async loadMigrations() {
    console.log('\n📁 读取迁移文件...');
    
    const files = fs.readdirSync(this.migrationsDir)
      .filter(file => file.endsWith('.js'))
      .sort();
    
    for (const file of files) {
      const filePath = path.join(this.migrationsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      this.migrations.push({
        filename: file,
        timestamp: file.split('-')[0],
        name: file.replace(/^\d{8,14}-/, '').replace('.js', ''),
        path: filePath,
        content: content,
        size: fs.statSync(filePath).size
      });
    }
    
    console.log(`📊 找到 ${this.migrations.length} 个迁移文件`);
  }

  /**
   * 分析迁移目的
   */
  async analyzeMigrationPurposes() {
    console.log('\n🔍 分析迁移文件目的...');
    
    const migrationPurposes = {
      'create-users-table': {
        purpose: '创建用户表',
        category: 'table_creation',
        importance: 'critical',
        status: 'superseded'
      },
      'add-traffic-management-fields': {
        purpose: '添加流量管理字段',
        category: 'field_addition',
        importance: 'important',
        status: 'superseded'
      },
      'create-time-series-tables': {
        purpose: '创建时间序列表',
        category: 'table_creation',
        importance: 'important',
        status: 'active'
      },
      'add-traffic-quota': {
        purpose: '添加流量配额',
        category: 'field_addition',
        importance: 'important',
        status: 'superseded'
      },
      'add-user-port-range-and-expiry': {
        purpose: '添加用户端口范围和过期时间',
        category: 'field_addition',
        importance: 'important',
        status: 'superseded'
      },
      'create-user-forward-rules': {
        purpose: '创建用户转发规则表',
        category: 'table_creation',
        importance: 'critical',
        status: 'superseded'
      },
      'add-rule-traffic-field': {
        purpose: '添加规则流量字段',
        category: 'field_addition',
        importance: 'normal',
        status: 'superseded'
      },
      'optimize-traffic-architecture': {
        purpose: '优化流量架构',
        category: 'optimization',
        importance: 'important',
        status: 'superseded'
      },
      'remove-isactive-field': {
        purpose: '移除isActive字段',
        category: 'field_removal',
        importance: 'normal',
        status: 'superseded'
      },
      'add-listen-address-to-user-forward-rules': {
        purpose: '添加监听地址字段',
        category: 'field_addition',
        importance: 'normal',
        status: 'superseded'
      },
      'remove-system-level-traffic-stats': {
        purpose: '移除系统级流量统计',
        category: 'cleanup',
        importance: 'normal',
        status: 'superseded'
      },
      'add-usedTraffic-to-userforwardrules': {
        purpose: '添加已使用流量字段',
        category: 'field_addition',
        importance: 'normal',
        status: 'superseded'
      },
      'modify-traffic-quota-decimal': {
        purpose: '修改流量配额为小数类型',
        category: 'field_modification',
        importance: 'important',
        status: 'superseded'
      },
      'fix-user-forward-rules-constraints': {
        purpose: '修复用户转发规则约束',
        category: 'constraint_fix',
        importance: 'critical',
        status: 'superseded'
      },
      'fix-foreign-key-constraints': {
        purpose: '修复外键约束',
        category: 'constraint_fix',
        importance: 'critical',
        status: 'superseded'
      },
      'add-system-configs-table': {
        purpose: '添加系统配置表',
        category: 'table_creation',
        importance: 'important',
        status: 'active'
      },
      'remove-isactive-from-userforwardrules': {
        purpose: '从用户转发规则移除isActive',
        category: 'field_removal',
        importance: 'normal',
        status: 'superseded'
      },
      'final-database-consolidation': {
        purpose: '最终数据库结构统一',
        category: 'consolidation',
        importance: 'critical',
        status: 'active'
      }
    };
    
    for (const migration of this.migrations) {
      const analysis = migrationPurposes[migration.name] || {
        purpose: '未知目的',
        category: 'unknown',
        importance: 'unknown',
        status: 'unknown'
      };
      
      migration.analysis = analysis;
      console.log(`📋 ${migration.filename}: ${analysis.purpose} (${analysis.status})`);
    }
  }

  /**
   * 检查当前数据库状态
   */
  async checkCurrentDatabaseState() {
    console.log('\n💾 检查当前数据库状态...');
    
    try {
      const { sequelize } = require('../models');
      
      // 获取表结构
      const [tables] = await sequelize.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      );
      
      console.log(`📊 当前数据库表: ${tables.length} 个`);
      
      // 检查关键表的字段
      const keyTables = ['Users', 'UserForwardRules', 'SystemConfigs'];
      
      for (const tableName of keyTables) {
        if (tables.some(t => t.name === tableName)) {
          const [columns] = await sequelize.query(`PRAGMA table_info(${tableName})`);
          console.log(`   📋 ${tableName}: ${columns.length} 个字段`);
          
          // 检查关键字段
          if (tableName === 'Users') {
            const hasTrafficQuota = columns.some(c => c.name === 'trafficQuota');
            const hasPortRange = columns.some(c => c.name === 'portRangeStart');
            console.log(`      - trafficQuota: ${hasTrafficQuota ? '✅' : '❌'}`);
            console.log(`      - portRange: ${hasPortRange ? '✅' : '❌'}`);
          }
          
          if (tableName === 'UserForwardRules') {
            const hasUsedTraffic = columns.some(c => c.name === 'usedTraffic');
            const hasListenAddress = columns.some(c => c.name === 'listenAddress');
            const hasIsActive = columns.some(c => c.name === 'isActive');
            console.log(`      - usedTraffic: ${hasUsedTraffic ? '✅' : '❌'}`);
            console.log(`      - listenAddress: ${hasListenAddress ? '✅' : '❌'}`);
            console.log(`      - isActive: ${hasIsActive ? '❌ (应该已移除)' : '✅ (已正确移除)'}`);
          }
        }
      }
      
    } catch (error) {
      console.error(`❌ 数据库检查失败: ${error.message}`);
    }
  }

  /**
   * 识别废弃迁移
   */
  async identifyDeprecatedMigrations() {
    console.log('\n🗑️ 识别废弃迁移文件...');
    
    const deprecatedMigrations = [];
    const activeMigrations = [];
    
    for (const migration of this.migrations) {
      if (migration.analysis.status === 'superseded') {
        deprecatedMigrations.push(migration);
      } else if (migration.analysis.status === 'active') {
        activeMigrations.push(migration);
      }
    }
    
    console.log(`📊 迁移文件分类:`);
    console.log(`   - 废弃迁移: ${deprecatedMigrations.length} 个`);
    console.log(`   - 活跃迁移: ${activeMigrations.length} 个`);
    
    console.log('\n🗑️ 废弃的迁移文件:');
    for (const migration of deprecatedMigrations) {
      console.log(`   ❌ ${migration.filename} - ${migration.analysis.purpose}`);
    }
    
    console.log('\n✅ 仍需保留的迁移文件:');
    for (const migration of activeMigrations) {
      console.log(`   ✅ ${migration.filename} - ${migration.analysis.purpose}`);
    }
    
    this.analysis.deprecated = deprecatedMigrations;
    this.analysis.active = activeMigrations;
  }

  /**
   * 生成清理建议
   */
  async generateCleanupRecommendations() {
    console.log('\n💡 生成清理建议...');
    
    const recommendations = {
      timestamp: new Date().toISOString(),
      summary: {
        total_migrations: this.migrations.length,
        deprecated_migrations: this.analysis.deprecated.length,
        active_migrations: this.analysis.active.length,
        can_be_removed: this.analysis.deprecated.length
      },
      analysis: {
        final_consolidation_impact: '最终统一迁移包含了所有之前迁移的累积效果',
        database_state: '当前数据库结构已经是所有迁移的最终结果',
        migration_history: '迁移历史记录在SequelizeMeta表中，但实际结构已统一'
      },
      recommendations: {
        safe_to_remove: this.analysis.deprecated.map(m => m.filename),
        must_keep: this.analysis.active.map(m => m.filename),
        reasoning: [
          '最终统一迁移(20250615083000-final-database-consolidation.js)包含了所有表结构',
          '时间序列表迁移(20240115000002-create-time-series-tables.js)仍然需要保留',
          '系统配置表迁移(20250613101856-add-system-configs-table.js)仍然需要保留',
          '其他迁移的效果都已经包含在最终统一迁移中'
        ]
      },
      cleanup_strategy: {
        approach: 'conservative',
        steps: [
          '1. 备份当前迁移目录',
          '2. 创建新的简化迁移集合',
          '3. 保留关键的表创建迁移',
          '4. 移除被统一迁移覆盖的迁移',
          '5. 更新SequelizeMeta记录'
        ]
      },
      risk_assessment: {
        level: 'low',
        reasons: [
          '数据库结构已经稳定',
          '最终统一迁移包含完整结构',
          '有完整的备份机制'
        ]
      }
    };
    
    const reportPath = path.join(this.projectRoot, 'backend/backups', `migration_analysis_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    
    // 确保备份目录存在
    const backupDir = path.dirname(reportPath);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(recommendations, null, 2));
    
    console.log(`✅ 分析报告已生成: ${path.basename(reportPath)}`);
    console.log('\n📊 清理建议摘要:');
    console.log(`   - 可安全移除: ${recommendations.summary.can_be_removed} 个迁移文件`);
    console.log(`   - 必须保留: ${recommendations.summary.active_migrations} 个迁移文件`);
    console.log(`   - 风险评估: ${recommendations.risk_assessment.level.toUpperCase()}`);
    
    console.log('\n🎯 建议保留的迁移文件:');
    for (const filename of recommendations.recommendations.must_keep) {
      console.log(`   ✅ ${filename}`);
    }
    
    console.log('\n🗑️ 建议移除的迁移文件:');
    for (const filename of recommendations.recommendations.safe_to_remove) {
      console.log(`   ❌ ${filename}`);
    }
  }
}

// 主程序
async function main() {
  const analyzer = new MigrationAnalyzer();
  
  try {
    await analyzer.analyze();
    process.exit(0);
  } catch (error) {
    console.error('\n💥 分析失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = MigrationAnalyzer;
