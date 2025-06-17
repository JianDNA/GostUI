#!/usr/bin/env node

/**
 * 🚀 GOST 代理管理系统 - 生产环境数据库初始化脚本
 * 
 * 功能:
 * 1. 清空现有数据库
 * 2. 重新创建所有表结构 (基于生产环境导出)
 * 3. 创建默认管理员用户 (admin/admin123)
 * 4. 初始化系统配置
 * 5. 生成初始化报告
 * 
 * 使用方法:
 * node scripts/init-production-database.js
 * 
 * 注意: 此操作会清空所有数据，请谨慎使用！
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

class ProductionDatabaseInitializer {
  constructor() {
    this.dbPath = path.join(__dirname, '../database/database.sqlite');
    this.schemaPath = path.join(__dirname, '../complete_schema.sql');
    this.backupDir = path.join(__dirname, '../backups');
    this.db = null;
    
    console.log('🚀 GOST 代理管理系统 - 生产环境数据库初始化');
    console.log('=' .repeat(60));
  }

  /**
   * 主初始化流程
   */
  async initialize() {
    try {
      // 1. 创建备份目录
      await this.createBackupDirectory();
      
      // 2. 备份现有数据库
      await this.backupExistingDatabase();
      
      // 3. 连接数据库
      await this.connectDatabase();
      
      // 4. 清空数据库
      await this.clearDatabase();
      
      // 5. 创建表结构
      await this.createTables();
      
      // 6. 创建默认管理员
      await this.createDefaultAdmin();
      
      // 7. 初始化系统配置
      await this.initializeSystemConfig();
      
      // 8. 验证初始化结果
      await this.verifyInitialization();
      
      // 9. 生成报告
      await this.generateReport();
      
      console.log('\n🎉 数据库初始化完成！');
      console.log('默认管理员账户: admin / admin123');
      
    } catch (error) {
      console.error('\n❌ 初始化失败:', error);
      throw error;
    } finally {
      if (this.db) {
        this.db.close();
      }
    }
  }

  /**
   * 创建备份目录
   */
  async createBackupDirectory() {
    console.log('\n📁 创建备份目录...');
    
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
      console.log('✅ 备份目录已创建');
    } else {
      console.log('✅ 备份目录已存在');
    }
  }

  /**
   * 备份现有数据库
   */
  async backupExistingDatabase() {
    console.log('\n💾 备份现有数据库...');
    
    if (fs.existsSync(this.dbPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.backupDir, `database_backup_${timestamp}.sqlite`);
      
      fs.copyFileSync(this.dbPath, backupPath);
      console.log(`✅ 数据库已备份到: ${backupPath}`);
    } else {
      console.log('ℹ️ 未找到现有数据库文件，跳过备份');
    }
  }

  /**
   * 连接数据库
   */
  async connectDatabase() {
    console.log('\n🔌 连接数据库...');
    
    return new Promise((resolve, reject) => {
      // 确保数据库目录存在
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('✅ 数据库连接成功');
          resolve();
        }
      });
    });
  }

  /**
   * 清空数据库
   */
  async clearDatabase() {
    console.log('\n🧹 清空现有数据库...');

    return new Promise((resolve, reject) => {
      // 获取所有用户表名（排除系统表）
      this.db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", (err, tables) => {
        if (err) {
          reject(err);
          return;
        }

        if (tables.length === 0) {
          console.log('ℹ️ 没有找到用户表，跳过清理');
          resolve();
          return;
        }

        // 删除所有用户表
        const dropPromises = tables.map(table => {
          return new Promise((res, rej) => {
            this.db.run(`DROP TABLE IF EXISTS \`${table.name}\``, (err) => {
              if (err) {
                console.warn(`⚠️ 删除表 ${table.name} 失败:`, err.message);
                res(); // 继续执行，不中断流程
              } else {
                res();
              }
            });
          });
        });

        Promise.all(dropPromises)
          .then(() => {
            console.log(`✅ 已删除 ${tables.length} 个用户表`);
            resolve();
          })
          .catch(reject);
      });
    });
  }

  /**
   * 创建表结构
   */
  async createTables() {
    console.log('\n🏗️ 创建表结构...');
    
    if (!fs.existsSync(this.schemaPath)) {
      throw new Error(`Schema 文件不存在: ${this.schemaPath}`);
    }
    
    const schema = fs.readFileSync(this.schemaPath, 'utf8');
    const statements = schema.split(';').filter(stmt => stmt.trim());
    
    console.log(`📋 执行 ${statements.length} 个 SQL 语句...`);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (statement) {
        await this.executeSQL(statement);
        console.log(`✅ [${i + 1}/${statements.length}] 执行完成`);
      }
    }
    
    console.log('✅ 表结构创建完成');
  }

  /**
   * 创建默认管理员
   */
  async createDefaultAdmin() {
    console.log('\n👤 创建默认管理员用户...');
    
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    const now = new Date().toISOString();
    
    const sql = `
      INSERT INTO Users (
        username, password, email, role, isActive, 
        createdAt, updatedAt, usedTraffic, userStatus
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      'admin',
      hashedPassword,
      null,
      'admin',
      1,
      now,
      now,
      0,
      'active'
    ];
    
    await this.executeSQL(sql, params);
    console.log('✅ 默认管理员用户已创建');
    console.log('   用户名: admin');
    console.log('   密码: admin123');
  }

  /**
   * 初始化系统配置
   */
  async initializeSystemConfig() {
    console.log('\n⚙️ 初始化系统配置...');

    const configs = [
      // 系统基础配置
      {
        key: 'system_version',
        value: JSON.stringify('1.0.0'),
        description: '系统版本',
        category: 'system'
      },
      {
        key: 'initialized_at',
        value: JSON.stringify(new Date().toISOString()),
        description: '系统初始化时间',
        category: 'system'
      },
      {
        key: 'default_performance_mode',
        value: JSON.stringify('balanced'),
        description: '默认性能模式',
        category: 'performance'
      },

      // 前端需要的配置项
      {
        key: 'disabledProtocols',
        value: JSON.stringify([]),
        description: '禁用的协议列表',
        category: 'security'
      },
      {
        key: 'allowedProtocols',
        value: JSON.stringify(['tcp', 'udp', 'tls']),
        description: '允许的协议列表',
        category: 'security'
      },
      {
        key: 'maxPortRange',
        value: JSON.stringify(65535),
        description: '最大端口范围',
        category: 'security'
      },
      {
        key: 'minPortRange',
        value: JSON.stringify(1024),
        description: '最小端口范围',
        category: 'security'
      },
      {
        key: 'defaultTrafficQuota',
        value: JSON.stringify(10),
        description: '默认流量配额(GB)',
        category: 'quota'
      },
      {
        key: 'autoSyncEnabled',
        value: JSON.stringify(true),
        description: '自动同步是否启用',
        category: 'sync'
      },
      {
        key: 'syncInterval',
        value: JSON.stringify(60),
        description: '同步间隔(秒)',
        category: 'sync'
      },
      {
        key: 'healthCheckEnabled',
        value: JSON.stringify(true),
        description: '健康检查是否启用',
        category: 'monitoring'
      },
      {
        key: 'observerPeriod',
        value: JSON.stringify(30),
        description: '观察器周期(秒)',
        category: 'performance'
      },
      {
        key: 'performanceMode',
        value: JSON.stringify('balanced'),
        description: '当前性能模式',
        category: 'performance'
      }
    ];
    
    const now = new Date().toISOString();
    
    for (const config of configs) {
      const sql = `
        INSERT INTO SystemConfigs (
          \`key\`, value, description, category, updatedBy, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      const params = [
        config.key,
        config.value,
        config.description,
        config.category,
        'system',
        now,
        now
      ];
      
      await this.executeSQL(sql, params);
    }
    
    console.log(`✅ 已初始化 ${configs.length} 个系统配置`);
  }

  /**
   * 验证初始化结果
   */
  async verifyInitialization() {
    console.log('\n🔍 验证初始化结果...');
    
    // 检查表数量
    const tables = await this.querySQL("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'");
    console.log(`✅ 数据库表数量: ${tables[0].count}`);
    
    // 检查管理员用户
    const users = await this.querySQL("SELECT COUNT(*) as count FROM Users WHERE role='admin'");
    console.log(`✅ 管理员用户数量: ${users[0].count}`);
    
    // 检查系统配置
    const configs = await this.querySQL("SELECT COUNT(*) as count FROM SystemConfigs");
    console.log(`✅ 系统配置数量: ${configs[0].count}`);
  }

  /**
   * 生成初始化报告
   */
  async generateReport() {
    console.log('\n📊 生成初始化报告...');
    
    const report = {
      timestamp: new Date().toISOString(),
      database_path: this.dbPath,
      tables: await this.querySQL("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"),
      admin_user: await this.querySQL("SELECT id, username, role, createdAt FROM Users WHERE role='admin'"),
      system_configs: await this.querySQL("SELECT key, description, category FROM SystemConfigs ORDER BY category, key")
    };
    
    const reportPath = path.join(this.backupDir, `init_report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`✅ 初始化报告已生成: ${reportPath}`);
  }

  /**
   * 执行 SQL 语句
   */
  executeSQL(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this);
        }
      });
    });
  }

  /**
   * 查询 SQL
   */
  querySQL(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }
}

// 主程序
async function main() {
  const initializer = new ProductionDatabaseInitializer();
  
  try {
    await initializer.initialize();
    process.exit(0);
  } catch (error) {
    console.error('\n💥 初始化失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = ProductionDatabaseInitializer;
