#!/usr/bin/env node

/**
 * 🔧 系统配置修复脚本
 * 
 * 功能:
 * 1. 检查缺失的系统配置项
 * 2. 添加前端需要的配置项
 * 3. 修复404错误
 * 
 * 使用方法:
 * node scripts/fix-system-config.js
 */

const { SystemConfig } = require('../models');

class SystemConfigFixer {
  constructor() {
    console.log('🔧 系统配置修复工具');
    console.log('=' .repeat(50));
  }

  /**
   * 主修复流程
   */
  async fix() {
    try {
      // 1. 检查现有配置
      await this.checkExistingConfigs();
      
      // 2. 添加缺失配置
      await this.addMissingConfigs();
      
      // 3. 验证修复结果
      await this.verifyConfigs();
      
      console.log('\n🎉 系统配置修复完成！');
      
    } catch (error) {
      console.error('\n❌ 修复失败:', error);
      throw error;
    }
  }

  /**
   * 检查现有配置
   */
  async checkExistingConfigs() {
    console.log('\n🔍 检查现有系统配置...');
    
    const configs = await SystemConfig.findAll({
      order: [['category', 'ASC'], ['key', 'ASC']]
    });
    
    console.log(`✅ 找到 ${configs.length} 个现有配置:`);
    
    const configsByCategory = {};
    for (const config of configs) {
      if (!configsByCategory[config.category]) {
        configsByCategory[config.category] = [];
      }
      configsByCategory[config.category].push(config.key);
    }
    
    for (const [category, keys] of Object.entries(configsByCategory)) {
      console.log(`   📂 ${category}: ${keys.join(', ')}`);
    }
  }

  /**
   * 添加缺失配置
   */
  async addMissingConfigs() {
    console.log('\n➕ 添加缺失的系统配置...');
    
    const requiredConfigs = [
      // 前端需要的安全配置
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
      
      // 配额配置
      {
        key: 'defaultTrafficQuota',
        value: JSON.stringify(10),
        description: '默认流量配额(GB)',
        category: 'quota'
      },
      
      // 同步配置
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
      
      // 监控配置
      {
        key: 'healthCheckEnabled',
        value: JSON.stringify(true),
        description: '健康检查是否启用',
        category: 'monitoring'
      },
      
      // 性能配置
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
      },
      {
        key: 'default_performance_mode',
        value: JSON.stringify('balanced'),
        description: '默认性能模式',
        category: 'performance'
      },
      
      // 系统配置
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
      }
    ];
    
    let addedCount = 0;
    const now = new Date().toISOString();
    
    for (const config of requiredConfigs) {
      try {
        // 检查配置是否已存在
        const existing = await SystemConfig.findByPk(config.key);
        
        if (!existing) {
          // 创建新配置
          await SystemConfig.create({
            key: config.key,
            value: config.value,
            description: config.description,
            category: config.category,
            updatedBy: 'system_fixer',
            createdAt: now,
            updatedAt: now
          });
          
          console.log(`✅ 添加配置: ${config.key} (${config.category})`);
          addedCount++;
        } else {
          console.log(`⏭️ 跳过已存在: ${config.key}`);
        }
      } catch (error) {
        console.error(`❌ 添加配置 ${config.key} 失败:`, error.message);
      }
    }
    
    console.log(`📊 总计添加 ${addedCount} 个配置项`);
  }

  /**
   * 验证修复结果
   */
  async verifyConfigs() {
    console.log('\n🔍 验证修复结果...');
    
    const criticalConfigs = [
      'disabledProtocols',
      'allowedProtocols',
      'performanceMode',
      'autoSyncEnabled'
    ];
    
    let allValid = true;
    
    for (const key of criticalConfigs) {
      try {
        const value = await SystemConfig.getValue(key);
        if (value !== null) {
          console.log(`✅ ${key}: ${JSON.stringify(value)}`);
        } else {
          console.log(`❌ ${key}: 配置缺失`);
          allValid = false;
        }
      } catch (error) {
        console.log(`❌ ${key}: 读取失败 - ${error.message}`);
        allValid = false;
      }
    }
    
    if (allValid) {
      console.log('\n🎉 所有关键配置验证通过！');
    } else {
      console.log('\n⚠️ 部分配置验证失败，请检查');
    }
    
    // 显示配置统计
    const totalConfigs = await SystemConfig.count();
    console.log(`📊 当前系统配置总数: ${totalConfigs}`);
  }
}

// 主程序
async function main() {
  const fixer = new SystemConfigFixer();
  
  try {
    await fixer.fix();
    process.exit(0);
  } catch (error) {
    console.error('\n💥 修复失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = SystemConfigFixer;
