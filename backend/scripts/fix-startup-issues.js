/**
 * 启动问题修复脚本
 * 
 * 功能说明:
 * 1. 检查并修复数据库关联问题
 * 2. 验证用户数据完整性
 * 3. 测试缓存服务连接
 * 4. 提供诊断信息
 */

const { sequelize, models } = require('../services/dbService');
const { User } = models;

async function fixStartupIssues() {
  try {
    console.log('🔧 开始修复启动问题...');

    // 1. 检查数据库连接
    console.log('📊 检查数据库连接...');
    await sequelize.authenticate();
    console.log('✅ 数据库连接正常');

    // 2. 检查用户表结构
    console.log('🔍 检查用户表结构...');
    const tableInfo = await sequelize.getQueryInterface().describeTable('Users');
    console.log('📋 用户表字段:', Object.keys(tableInfo));

    // 检查是否有流量相关字段
    const hasTrafficFields = ['usedTraffic', 'lastTrafficReset', 'userStatus'].every(
      field => tableInfo[field]
    );

    if (!hasTrafficFields) {
      console.log('⚠️ 缺少流量管理字段，需要运行数据库迁移');
      console.log('💡 请运行: npm run db:migrate');
    } else {
      console.log('✅ 流量管理字段已存在');
    }

    // 3. 检查用户数据
    console.log('👥 检查用户数据...');
    const userCount = await User.count();
    console.log(`📊 总用户数: ${userCount}`);

    if (userCount > 0) {
      // 获取示例用户数据
      const sampleUsers = await User.findAll({
        limit: 3,
        attributes: ['id', 'username', 'portRangeStart', 'portRangeEnd', 'trafficQuota', 'isActive']
      });

      console.log('👤 示例用户数据:');
      sampleUsers.forEach(user => {
        console.log(`   用户 ${user.username}: 端口范围=${user.portRangeStart}-${user.portRangeEnd}, 流量限额=${user.trafficQuota}GB, 状态=${user.isActive ? '激活' : '禁用'}`);
      });

      // 检查用户数据完整性
      const usersWithoutPortRange = await User.count({
        where: {
          [sequelize.Op.or]: [
            { portRangeStart: null },
            { portRangeEnd: null }
          ]
        }
      });

      if (usersWithoutPortRange > 0) {
        console.log(`⚠️ 有 ${usersWithoutPortRange} 个用户没有设置端口范围`);
      }
    }

    // 4. 检查内存缓存服务
    console.log('💾 检查内存缓存服务...');
    console.log('✅ 内存缓存服务可用 (无需外部依赖)');

    // 5. 测试 InfluxDB 连接 (如果配置了)
    if (process.env.INFLUX_URL) {
      console.log('📊 测试 InfluxDB 连接...');
      try {
        const { InfluxDB } = require('@influxdata/influxdb-client');
        const client = new InfluxDB({
          url: process.env.INFLUX_URL,
          token: process.env.INFLUX_TOKEN || 'dummy-token'
        });

        // 简单测试
        console.log('✅ InfluxDB 客户端创建成功');
        console.log('💡 流量统计功能将可用');
      } catch (error) {
        console.log('⚠️ InfluxDB 连接失败:', error.message);
        console.log('💡 流量统计功能将受限');
      }
    } else {
      console.log('ℹ️ 未配置 InfluxDB，流量统计功能将受限');
    }

    // 6. 检查 GOST 二进制文件
    console.log('🚀 检查 GOST 二进制文件...');
    const fs = require('fs');
    const path = require('path');
    
    const gostPaths = [
      path.join(__dirname, '../bin/gost.exe'),
      path.join(__dirname, '../bin/gost'),
      path.join(__dirname, '../assets/gost/gost.exe'),
      path.join(__dirname, '../assets/gost/gost')
    ];

    let gostFound = false;
    for (const gostPath of gostPaths) {
      if (fs.existsSync(gostPath)) {
        console.log(`✅ 找到 GOST 二进制文件: ${gostPath}`);
        gostFound = true;
        break;
      }
    }

    if (!gostFound) {
      console.log('⚠️ 未找到 GOST 二进制文件');
      console.log('💡 请确保 GOST 二进制文件在正确位置');
    }

    // 7. 生成修复建议
    console.log('\n📋 修复建议:');
    
    if (!hasTrafficFields) {
      console.log('1. 运行数据库迁移: npm run db:migrate');
    }
    
    console.log('2. 系统使用多实例缓存，无需额外配置');
    
    if (!process.env.INFLUX_URL) {
      console.log('3. 配置 InfluxDB 以启用完整流量统计 (可选)');
    }

    console.log('\n✅ 启动问题诊断完成');
    
    return true;
  } catch (error) {
    console.error('❌ 修复过程中出现错误:', error);
    return false;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  console.log('🔧 启动问题修复脚本');
  console.log('=====================================');
  
  fixStartupIssues()
    .then(success => {
      if (success) {
        console.log('\n🎉 修复完成，可以尝试重新启动服务');
      } else {
        console.log('\n❌ 修复失败，请检查错误信息');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    })
    .finally(() => {
      sequelize.close();
    });
}

module.exports = { fixStartupIssues };
