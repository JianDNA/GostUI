/**
 * 数据库迁移：修复邮箱唯一性约束问题
 * 
 * 问题：数据库中email字段有UNIQUE约束，导致无法创建多个邮箱为空的用户
 * 解决：移除数据库表中的email UNIQUE约束，改为在应用层处理
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);

async function migrateEmailUniqueConstraint() {
  const dbPath = path.join(__dirname, '../database/database.sqlite');

  if (!fs.existsSync(dbPath)) {
    console.log('⚠️ 数据库文件不存在，跳过迁移');
    return { success: true, skipped: true };
  }

  try {
    
    console.log('🔧 开始检查邮箱唯一性约束...');

    // 检查当前表结构
    const { stdout: schemaOutput } = await execAsync(`sqlite3 "${dbPath}" "SELECT sql FROM sqlite_master WHERE type='table' AND name='Users';"`);

    if (!schemaOutput.trim()) {
      console.log('⚠️ Users表不存在，跳过迁移');
      return { success: true, skipped: true };
    }

    const schema = schemaOutput.trim();

    // 检查是否存在email UNIQUE约束
    if (!schema.includes('email') || !schema.includes('UNIQUE')) {
      console.log('✅ 邮箱唯一性约束已经不存在，无需迁移');
      return { success: true, skipped: true };
    }

    // 检查email字段是否有UNIQUE约束
    if (!schema.match(/`?email`?\s+[^,]*UNIQUE/i)) {
      console.log('✅ 邮箱字段没有UNIQUE约束，无需迁移');
      return { success: true, skipped: true };
    }
    
    console.log('🔧 发现邮箱UNIQUE约束，开始迁移...');

    // 创建迁移SQL脚本
    const migrationSQL = `
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

    // 执行迁移
    console.log('📋 执行数据库迁移...');
    await execAsync(`sqlite3 "${dbPath}" "${migrationSQL}"`);

    console.log('✅ 邮箱唯一性约束迁移完成！');
    return { success: true, migrated: true };
    
  } catch (error) {
    console.error('❌ 迁移邮箱约束失败:', error);
    return { success: false, error: error.message };
  }
}

// 如果直接运行此文件
if (require.main === module) {
  migrateEmailUniqueConstraint()
    .then(result => {
      if (result.success) {
        if (result.skipped) {
          console.log('✅ 迁移检查完成，无需操作');
        } else if (result.migrated) {
          console.log('✅ 迁移成功完成');
        }
        process.exit(0);
      } else {
        console.error('❌ 迁移失败:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ 迁移过程出错:', error);
      process.exit(1);
    });
}

module.exports = migrateEmailUniqueConstraint;
