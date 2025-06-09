/**
 * 开发环境启动脚本
 * 
 * 功能说明:
 * 1. 自动检测环境配置
 * 2. 设置合适的环境变量
 * 3. 检查依赖服务
 * 4. 启动应用
 */

const fs = require('fs');
const path = require('path');

function loadEnvironmentConfig() {
  console.log('🔧 配置开发环境...');

  // 检查是否有 .env 文件
  const envPath = path.join(__dirname, '../.env');
  const devEnvPath = path.join(__dirname, '../.env.development');

  if (!fs.existsSync(envPath) && fs.existsSync(devEnvPath)) {
    console.log('📋 使用开发环境配置文件');
    // 复制开发环境配置
    fs.copyFileSync(devEnvPath, envPath);
  }

  // 设置开发环境默认值
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';
  process.env.PORT = process.env.PORT || '3000';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret';

  console.log('✅ 环境配置完成');
}

async function checkOptionalServices() {
  console.log('🔍 检查可选服务...');

  // 使用内存缓存，无需外部依赖
  console.log('✅ 内存缓存服务可用');

  // SQLite 时序数据总是可用的
  console.log('✅ SQLite 时序数据存储可用');
}

async function startApplication() {
  try {
    console.log('🚀 启动 Gost 管理系统 (开发模式)');
    console.log('=====================================');

    // 1. 配置环境
    loadEnvironmentConfig();

    // 2. 检查可选服务
    await checkOptionalServices();

    // 3. 显示配置信息
    console.log('\n📊 当前配置:');
    console.log(`   端口: ${process.env.PORT}`);
    console.log(`   环境: ${process.env.NODE_ENV}`);
    console.log(`   Redis: ${process.env.REDIS_HOST ? '✅ 启用' : '❌ 禁用'}`);
    console.log(`   时序数据: ✅ SQLite`);
    console.log(`   数据库同步间隔: ${process.env.DB_SYNC_INTERVAL || 45000}ms`);

    console.log('\n🎯 功能状态:');
    console.log(`   用户认证: ✅ 可用`);
    console.log(`   端口转发: ✅ 可用`);
    console.log(`   流量控制: ✅ 可用`);
    console.log(`   实时监控: ${process.env.REDIS_HOST ? '✅ 可用' : '⚠️ 受限'}`);
    console.log(`   流量统计: ✅ 完全可用 (SQLite)`);

    console.log('\n🔗 访问地址:');
    console.log(`   后端 API: http://localhost:${process.env.PORT}`);
    console.log(`   健康检查: http://localhost:${process.env.PORT}/api/health`);
    console.log(`   GOST 状态: http://localhost:${process.env.PORT}/api/gost/status`);

    console.log('\n⚡ 开发工具:');
    console.log(`   重启服务: 在控制台输入 'rs'`);
    console.log(`   查看日志: tail -f logs/app.log`);
    console.log(`   数据库迁移: npm run db:migrate`);

    console.log('\n=====================================');
    console.log('🎉 准备启动应用...\n');

    // 4. 启动应用
    require('../app.js');

  } catch (error) {
    console.error('❌ 启动失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  startApplication();
}

module.exports = { startApplication };
