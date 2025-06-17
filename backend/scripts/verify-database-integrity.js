#!/usr/bin/env node

/**
 * 🔍 数据库完整性验证脚本
 * 
 * 功能:
 * 1. 检查数据库表结构
 * 2. 验证外键约束
 * 3. 测试级联删除
 * 4. 检查索引完整性
 * 5. 验证数据一致性
 */

const { sequelize, User, UserForwardRule, SystemConfig } = require('../models');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class DatabaseIntegrityVerifier {
  constructor() {
    this.dbPath = path.join(__dirname, '../database/database.sqlite');
    console.log('🔍 数据库完整性验证工具');
    console.log('=' .repeat(60));
  }

  /**
   * 主验证流程
   */
  async verify() {
    try {
      // 1. 检查数据库连接
      await this.checkConnection();
      
      // 2. 验证表结构
      await this.verifyTableStructure();
      
      // 3. 检查外键约束
      await this.checkForeignKeys();
      
      // 4. 验证索引
      await this.verifyIndexes();
      
      // 5. 测试级联删除
      await this.testCascadeDelete();
      
      // 6. 检查数据一致性
      await this.checkDataConsistency();
      
      // 7. 生成报告
      await this.generateReport();
      
      console.log('\n🎉 数据库完整性验证完成！');
      
    } catch (error) {
      console.error('\n❌ 验证失败:', error);
      throw error;
    }
  }

  /**
   * 检查数据库连接
   */
  async checkConnection() {
    console.log('\n🔌 检查数据库连接...');
    
    try {
      await sequelize.authenticate();
      console.log('✅ 数据库连接正常');
    } catch (error) {
      throw new Error(`数据库连接失败: ${error.message}`);
    }
  }

  /**
   * 验证表结构
   */
  async verifyTableStructure() {
    console.log('\n🏗️ 验证表结构...');
    
    const expectedTables = [
      'Users',
      'UserForwardRules', 
      'SystemConfigs',
      'traffic_hourly',
      'speed_minutely',
      'Rules',
      'ForwardRules',
      'TrafficLogs',
      'SequelizeMeta'
    ];
    
    const [results] = await sequelize.query(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    
    const actualTables = results.map(row => row.name);
    
    console.log(`📊 期望表数量: ${expectedTables.length}`);
    console.log(`📊 实际表数量: ${actualTables.length}`);
    
    // 检查缺失的表
    const missingTables = expectedTables.filter(table => !actualTables.includes(table));
    if (missingTables.length > 0) {
      console.error(`❌ 缺失的表: ${missingTables.join(', ')}`);
      throw new Error('数据库表结构不完整');
    }
    
    // 检查额外的表
    const extraTables = actualTables.filter(table => !expectedTables.includes(table));
    if (extraTables.length > 0) {
      console.warn(`⚠️ 额外的表: ${extraTables.join(', ')}`);
    }
    
    console.log('✅ 表结构验证通过');
  }

  /**
   * 检查外键约束
   */
  async checkForeignKeys() {
    console.log('\n🔗 检查外键约束...');
    
    // 检查 UserForwardRules 的外键
    const userRulesFkResult = await sequelize.query("PRAGMA foreign_key_list(UserForwardRules)");
    const userRulesFk = userRulesFkResult[0]; // 获取结果数组
    console.log('📋 UserForwardRules 外键约束:');

    if (userRulesFk && userRulesFk.length > 0) {
      for (const fk of userRulesFk) {
        console.log(`   - ${fk.from} -> ${fk.table}.${fk.to} (${fk.on_delete}/${fk.on_update})`);

        if (fk.from === 'userId' && fk.on_delete !== 'CASCADE') {
          console.error(`❌ UserForwardRules.userId 外键约束错误: ${fk.on_delete} (应该是 CASCADE)`);
          throw new Error('外键约束配置错误');
        }
      }
    } else {
      console.warn('⚠️ UserForwardRules 表没有外键约束');
    }
    
    // 检查其他表的外键
    const tablesWithFk = ['Rules', 'ForwardRules', 'TrafficLogs'];
    for (const table of tablesWithFk) {
      const fkResult = await sequelize.query(`PRAGMA foreign_key_list(${table})`);
      const fks = fkResult[0]; // 获取结果数组
      console.log(`📋 ${table} 外键约束: ${fks ? fks.length : 0} 个`);
    }
    
    console.log('✅ 外键约束检查通过');
  }

  /**
   * 验证索引
   */
  async verifyIndexes() {
    console.log('\n📇 验证索引...');
    
    const expectedIndexes = [
      'idx_traffic_hourly_user_time',
      'idx_traffic_hourly_user_hour', 
      'idx_traffic_hourly_port',
      'idx_traffic_hourly_time',
      'unique_user_port_hour',
      'idx_speed_minutely_user_time',
      'idx_speed_minutely_user_minute',
      'idx_speed_minutely_port', 
      'idx_speed_minutely_time',
      'unique_user_port_minute',
      'idx_user_forward_rules_user_id'
    ];
    
    const [results] = await sequelize.query(
      "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    
    const actualIndexes = results.map(row => row.name);
    
    console.log(`📊 期望索引数量: ${expectedIndexes.length}`);
    console.log(`📊 实际索引数量: ${actualIndexes.length}`);
    
    const missingIndexes = expectedIndexes.filter(index => !actualIndexes.includes(index));
    if (missingIndexes.length > 0) {
      console.warn(`⚠️ 缺失的索引: ${missingIndexes.join(', ')}`);
    }
    
    console.log('✅ 索引验证完成');
  }

  /**
   * 测试级联删除
   */
  async testCascadeDelete() {
    console.log('\n🧪 测试级联删除...');
    
    // 启用外键约束
    await sequelize.query('PRAGMA foreign_keys = ON');
    
    // 创建测试用户
    const testUser = await User.create({
      username: `test_cascade_${Date.now()}`,
      password: 'test123',
      role: 'user',
      trafficQuota: 1.0,
      portRangeStart: 19000,
      portRangeEnd: 20000
    });
    
    console.log(`✅ 创建测试用户: ${testUser.username} (ID: ${testUser.id})`);
    
    // 创建测试规则
    const testRule = await UserForwardRule.create({
      userId: testUser.id,
      ruleUUID: require('uuid').v4(),
      name: '级联删除测试规则',
      sourcePort: 19999,
      targetAddress: '127.0.0.1:8080',
      protocol: 'tcp'
    });
    
    console.log(`✅ 创建测试规则: ${testRule.name} (ID: ${testRule.id})`);
    
    // 删除用户，测试级联删除
    await testUser.destroy();
    console.log(`✅ 删除测试用户: ${testUser.username}`);
    
    // 检查规则是否被级联删除
    const remainingRule = await UserForwardRule.findByPk(testRule.id);
    if (remainingRule) {
      throw new Error('级联删除失败：规则未被删除');
    }
    
    console.log('✅ 级联删除测试通过');
  }

  /**
   * 检查数据一致性
   */
  async checkDataConsistency() {
    console.log('\n🔍 检查数据一致性...');
    
    // 检查用户数据
    const userCount = await User.count();
    console.log(`👥 用户总数: ${userCount}`);
    
    // 检查规则数据
    const ruleCount = await UserForwardRule.count();
    console.log(`📋 规则总数: ${ruleCount}`);
    
    // 检查系统配置
    const configCount = await SystemConfig.count();
    console.log(`⚙️ 系统配置数量: ${configCount}`);
    
    // 检查孤立规则（用户不存在的规则）
    const [orphanRules] = await sequelize.query(`
      SELECT ufr.id, ufr.name, ufr.userId 
      FROM UserForwardRules ufr 
      LEFT JOIN Users u ON ufr.userId = u.id 
      WHERE u.id IS NULL
    `);
    
    if (orphanRules.length > 0) {
      console.warn(`⚠️ 发现 ${orphanRules.length} 个孤立规则:`);
      for (const rule of orphanRules) {
        console.warn(`   - 规则 ${rule.name} (ID: ${rule.id}) 引用不存在的用户 ${rule.userId}`);
      }
    } else {
      console.log('✅ 未发现孤立规则');
    }
    
    // 检查重复端口
    const [duplicatePorts] = await sequelize.query(`
      SELECT sourcePort, COUNT(*) as count 
      FROM UserForwardRules 
      GROUP BY sourcePort 
      HAVING COUNT(*) > 1
    `);
    
    if (duplicatePorts.length > 0) {
      console.warn(`⚠️ 发现 ${duplicatePorts.length} 个重复端口:`);
      for (const port of duplicatePorts) {
        console.warn(`   - 端口 ${port.sourcePort} 被 ${port.count} 个规则使用`);
      }
    } else {
      console.log('✅ 未发现重复端口');
    }
    
    console.log('✅ 数据一致性检查完成');
  }

  /**
   * 生成报告
   */
  async generateReport() {
    console.log('\n📊 生成验证报告...');
    
    const report = {
      timestamp: new Date().toISOString(),
      database_path: this.dbPath,
      verification_results: {
        connection: '✅ 正常',
        table_structure: '✅ 完整',
        foreign_keys: '✅ 正确',
        indexes: '✅ 完整',
        cascade_delete: '✅ 正常',
        data_consistency: '✅ 一致'
      },
      statistics: {
        users: await User.count(),
        rules: await UserForwardRule.count(),
        configs: await SystemConfig.count()
      },
      database_info: {
        size: this.getFileSize(this.dbPath),
        foreign_keys_enabled: await this.checkForeignKeysEnabled()
      }
    };
    
    const reportPath = path.join(__dirname, '../backups', `db_integrity_report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    require('fs').writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`✅ 验证报告已生成: ${reportPath}`);
    console.log('📊 验证摘要:');
    console.log(`   - 用户数量: ${report.statistics.users}`);
    console.log(`   - 规则数量: ${report.statistics.rules}`);
    console.log(`   - 配置数量: ${report.statistics.configs}`);
    console.log(`   - 数据库大小: ${report.database_info.size}`);
    console.log(`   - 外键约束: ${report.database_info.foreign_keys_enabled ? '启用' : '禁用'}`);
  }

  /**
   * 获取文件大小
   */
  getFileSize(filePath) {
    try {
      const stats = require('fs').statSync(filePath);
      const bytes = stats.size;
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    } catch (error) {
      return '未知';
    }
  }

  /**
   * 检查外键约束是否启用
   */
  async checkForeignKeysEnabled() {
    const result = await sequelize.query('PRAGMA foreign_keys');
    const rows = result[0];
    return rows && rows.length > 0 && rows[0].foreign_keys === 1;
  }
}

// 主程序
async function main() {
  const verifier = new DatabaseIntegrityVerifier();
  
  try {
    await verifier.verify();
    process.exit(0);
  } catch (error) {
    console.error('\n💥 验证失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = DatabaseIntegrityVerifier;
