#!/usr/bin/env node

/**
 * 测试环境设置脚本
 * 一键创建用户、规则、生成流量数据，并同步GOST配置
 */

const { exec } = require('child_process');
const path = require('path');
const { promisify } = require('util');

const execAsync = promisify(exec);

// 执行命令并显示输出
const runCommand = async (command, description) => {
  console.log(`\n🔄 ${description}...`);
  console.log(`💻 执行: ${command}`);
  
  try {
    const { stdout, stderr } = await execAsync(command, { 
      cwd: path.join(__dirname, '..'),
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });
    
    if (stdout) {
      console.log(stdout);
    }
    if (stderr) {
      console.error('⚠️ ', stderr);
    }
    
    return { success: true, stdout, stderr };
  } catch (error) {
    console.error(`❌ ${description}失败:`, error.message);
    return { success: false, error };
  }
};

// 检查GOST服务状态
const checkGostStatus = async () => {
  try {
    const response = await fetch('http://localhost:3000/api/gost/status');
    const data = await response.json();
    return data.isRunning;
  } catch (error) {
    return false;
  }
};

// 强制同步GOST配置
const syncGostConfig = async () => {
  try {
    const response = await fetch('http://localhost:3000/api/system/force-sync', {
      method: 'POST'
    });
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('同步GOST配置失败:', error.message);
    return false;
  }
};

// 主函数
async function setupTestEnvironment() {
  console.log('🚀 开始设置测试环境...');
  console.log('=' * 50);
  
  // 1. 生成测试数据
  const dataResult = await runCommand(
    'node scripts/generate-test-data.js',
    '生成测试用户和转发规则'
  );
  
  if (!dataResult.success) {
    console.error('❌ 测试数据生成失败，停止设置');
    process.exit(1);
  }
  
  // 2. 检查GOST服务状态
  console.log('\n🔍 检查GOST服务状态...');
  const gostRunning = await checkGostStatus();
  
  if (!gostRunning) {
    console.log('⚠️  GOST服务未运行，尝试启动...');
    await runCommand(
      'curl -X POST http://localhost:3000/api/gost/start',
      '启动GOST服务'
    );
    
    // 等待服务启动
    await new Promise(resolve => setTimeout(resolve, 3000));
  } else {
    console.log('✅ GOST服务正在运行');
  }
  
  // 3. 强制同步GOST配置
  console.log('\n🔄 同步GOST配置...');
  const syncSuccess = await syncGostConfig();
  
  if (syncSuccess) {
    console.log('✅ GOST配置同步成功');
  } else {
    console.log('⚠️  GOST配置同步失败，但继续执行');
  }
  
  // 等待配置生效
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 4. 生成初始流量
  console.log('\n📊 生成初始流量数据...');
  await runCommand(
    'node scripts/generate-traffic.js quick',
    '快速流量测试'
  );
  
  // 5. 等待流量统计更新
  console.log('\n⏰ 等待流量统计更新...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // 6. 显示测试环境信息
  console.log('\n📋 测试环境设置完成！');
  console.log('=' * 50);
  console.log('🎯 测试用户:');
  console.log('   user1: 端口 10100, 10101, 10102');
  console.log('   user2: 端口 10200, 10201, 10202');
  console.log('   user3: 端口 10300, 10301, 10302');
  console.log('');
  console.log('🔧 可用命令:');
  console.log('   生成更多流量: node scripts/generate-traffic.js');
  console.log('   快速测试:     node scripts/generate-traffic.js quick');
  console.log('   持续生成:     node scripts/generate-traffic.js continuous 2');
  console.log('   清理数据:     node scripts/generate-test-data.js clean');
  console.log('');
  console.log('🌐 前端页面:');
  console.log('   仪表盘:       http://localhost:8081/dashboard');
  console.log('   流量统计:     http://localhost:8081/traffic-stats');
  console.log('   系统状态:     http://localhost:8081/system-status');
  console.log('');
  console.log('🎉 现在可以在前端查看流量统计数据了！');
}

// 清理测试环境
async function cleanTestEnvironment() {
  console.log('🧹 清理测试环境...');
  
  // 1. 清理测试数据
  await runCommand(
    'node scripts/generate-test-data.js clean',
    '清理测试数据'
  );
  
  // 2. 重新同步GOST配置
  console.log('\n🔄 重新同步GOST配置...');
  const syncSuccess = await syncGostConfig();
  
  if (syncSuccess) {
    console.log('✅ GOST配置同步成功');
  }
  
  console.log('\n🎉 测试环境清理完成！');
}

// 生成持续流量
async function generateContinuousTraffic() {
  console.log('🔄 开始生成持续流量...');
  
  // 每2分钟生成一次流量，共10轮
  await runCommand(
    'node scripts/generate-traffic.js continuous 2',
    '生成持续流量'
  );
}

// 命令行参数处理
const command = process.argv[2];

switch (command) {
  case 'clean':
    cleanTestEnvironment().then(() => process.exit(0));
    break;
  case 'traffic':
    generateContinuousTraffic().then(() => process.exit(0));
    break;
  case 'quick':
    runCommand('node scripts/generate-traffic.js quick', '快速流量测试')
      .then(() => process.exit(0));
    break;
  default:
    setupTestEnvironment().then(() => process.exit(0));
}
