/**
 * 数据库修复脚本
 * 
 * 用于修复现有数据库中的已知问题，而不是传统的迁移系统
 * 这个脚本是幂等的，可以安全地多次运行
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);

async function fixEmailUniqueConstraint() {
  const dbPath = path.join(__dirname, 'database/database.sqlite');
  
  if (!fs.existsSync(dbPath)) {
    return { name: 'email-unique-constraint', success: true, skipped: true, reason: '数据库文件不存在' };
  }

  try {
    // 检查当前表结构
    const { stdout: schemaOutput } = await execAsync(`sqlite3 "${dbPath}" "SELECT sql FROM sqlite_master WHERE type='table' AND name='Users';"`);
    
    if (!schemaOutput.trim()) {
      return { name: 'email-unique-constraint', success: true, skipped: true, reason: 'Users表不存在' };
    }
    
    const schema = schemaOutput.trim();
    
    // 检查email字段是否有UNIQUE约束
    if (!schema.match(/`?email`?\s+[^,]*UNIQUE/i)) {
      return { name: 'email-unique-constraint', success: true, skipped: true, reason: '邮箱字段没有UNIQUE约束' };
    }
    
    console.log('🔧 发现邮箱UNIQUE约束，开始修复...');
    
    // 创建修复SQL脚本
    const fixSQL = `
      BEGIN TRANSACTION;
      
      CREATE TABLE Users_temp (
        id INTEGER PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        role TEXT NOT NULL DEFAULT 'user',
        portRange VARCHAR(255),
        token VARCHAR(255),
        isActive TINYINT(1) NOT NULL DEFAULT 1,
        createdAt DATETIME NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
        updatedAt DATETIME NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
        usedTraffic BIGINT NOT NULL DEFAULT '0',
        lastTrafficReset DATETIME,
        userStatus TEXT NOT NULL DEFAULT 'active',
        trafficQuota DECIMAL(10,3),
        portRangeStart INTEGER,
        portRangeEnd INTEGER,
        expiryDate DATETIME,
        additionalPorts TEXT
      );
      
      INSERT INTO Users_temp SELECT * FROM Users;
      DROP TABLE Users;
      ALTER TABLE Users_temp RENAME TO Users;
      
      COMMIT;
    `;
    
    // 执行修复
    await execAsync(`sqlite3 "${dbPath}" "${fixSQL}"`);
    
    return { name: 'email-unique-constraint', success: true, fixed: true, reason: '邮箱唯一性约束已移除' };
    
  } catch (error) {
    return { name: 'email-unique-constraint', success: false, error: error.message };
  }
}

async function fixAdminTrafficQuota() {
  const dbPath = path.join(__dirname, 'database/database.sqlite');

  if (!fs.existsSync(dbPath)) {
    return { name: 'admin-traffic-quota', success: true, skipped: true, reason: '数据库文件不存在' };
  }

  try {
    // 检查是否有管理员用户设置了流量限额
    const { stdout: adminCheck } = await execAsync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM Users WHERE role = 'admin' AND trafficQuota IS NOT NULL;"`);

    const adminWithQuota = parseInt(adminCheck.trim());

    if (adminWithQuota === 0) {
      return { name: 'admin-traffic-quota', success: true, skipped: true, reason: '管理员用户没有设置流量限额' };
    }

    console.log('🔧 发现管理员用户设置了流量限额，开始修复...');

    // 清除管理员用户的流量限额
    const fixSQL = `UPDATE Users SET trafficQuota = NULL WHERE role = 'admin';`;

    await execAsync(`sqlite3 "${dbPath}" "${fixSQL}"`);

    return { name: 'admin-traffic-quota', success: true, fixed: true, reason: '已清除管理员用户的流量限额设置' };

  } catch (error) {
    return { name: 'admin-traffic-quota', success: false, error: error.message };
  }
}

async function fixSystemConfigs() {
  const dbPath = path.join(__dirname, 'database/database.sqlite');

  if (!fs.existsSync(dbPath)) {
    return { name: 'system-configs', success: true, skipped: true, reason: '数据库文件不存在' };
  }

  try {
    // 检查SystemConfigs表是否存在
    const { stdout: tableCheck } = await execAsync(`sqlite3 "${dbPath}" "SELECT name FROM sqlite_master WHERE type='table' AND name='SystemConfigs';"`);

    if (!tableCheck.trim()) {
      return { name: 'system-configs', success: true, skipped: true, reason: 'SystemConfigs表不存在' };
    }

    // 检查allowUserExternalAccess配置是否存在
    const { stdout: configCheck } = await execAsync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM SystemConfigs WHERE key = 'allowUserExternalAccess';"`);

    const configExists = parseInt(configCheck.trim());

    if (configExists > 0) {
      return { name: 'system-configs', success: true, skipped: true, reason: 'allowUserExternalAccess配置已存在' };
    }

    console.log('🔧 缺少allowUserExternalAccess配置，开始添加...');

    // 添加缺失的系统配置
    const fixSQL = `
      INSERT OR IGNORE INTO SystemConfigs (key, value, description, category, updatedBy, createdAt, updatedAt)
      VALUES ('allowUserExternalAccess', 'true', '允许普通用户的转发规则被外部访问。true=监听所有接口(0.0.0.0)，false=仅本地访问(127.0.0.1)。管理员用户不受限制。', 'security', 'system', datetime('now'), datetime('now'));
    `;

    await execAsync(`sqlite3 "${dbPath}" "${fixSQL}"`);

    // 添加迁移记录
    const migrationSQL = `
      INSERT OR IGNORE INTO SequelizeMeta (name)
      VALUES ('20250617063000-add-user-external-access-config.js');
    `;

    await execAsync(`sqlite3 "${dbPath}" "${migrationSQL}"`);

    return { name: 'system-configs', success: true, fixed: true, reason: '已添加allowUserExternalAccess配置' };

  } catch (error) {
    return { name: 'system-configs', success: false, error: error.message };
  }
}

async function runDatabaseFixes() {
  console.log('🔧 开始运行数据库修复...');

  const fixes = [
    fixEmailUniqueConstraint,
    fixAdminTrafficQuota,
    fixSystemConfigs
  ];

  const results = [];
  
  for (const fix of fixes) {
    try {
      const result = await fix();
      results.push(result);
      
      if (result.success) {
        if (result.skipped) {
          console.log(`✅ ${result.name}: 跳过 - ${result.reason}`);
        } else if (result.fixed) {
          console.log(`✅ ${result.name}: 修复成功 - ${result.reason}`);
        } else {
          console.log(`✅ ${result.name}: 完成`);
        }
      } else {
        console.error(`❌ ${result.name}: 失败 - ${result.error}`);
      }
      
    } catch (error) {
      console.error(`❌ 修复执行出错: ${error.message}`);
      results.push({
        name: 'unknown',
        success: false,
        error: error.message
      });
    }
  }
  
  // 汇总结果
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const fixed = results.filter(r => r.fixed).length;
  const skipped = results.filter(r => r.skipped).length;
  
  console.log('\n📊 修复结果汇总:');
  console.log(`   ✅ 成功: ${successful}`);
  console.log(`   ❌ 失败: ${failed}`);
  console.log(`   🔧 已修复: ${fixed}`);
  console.log(`   ⏭️ 跳过: ${skipped}`);
  
  if (failed > 0) {
    console.log('\n❌ 部分修复失败，请检查错误信息');
    return { success: false, results };
  } else {
    console.log('\n✅ 所有修复完成');
    return { success: true, results };
  }
}

// 如果直接运行此文件
if (require.main === module) {
  runDatabaseFixes()
    .then(result => {
      if (result.success) {
        console.log('🎉 数据库修复完成');
        process.exit(0);
      } else {
        console.error('💥 数据库修复失败');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('💥 修复过程出错:', error);
      process.exit(1);
    });
}

module.exports = runDatabaseFixes;
