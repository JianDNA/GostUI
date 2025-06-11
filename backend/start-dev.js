#!/usr/bin/env node

/**
 * 开发环境启动脚本
 * 解决多实例启动时的端口冲突问题
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// 检查是否已有实例在运行
async function checkExistingInstance() {
  try {
    const response = await fetch('http://localhost:3000/api/health');
    if (response.ok) {
      console.log('🔍 检测到已有实例在运行');
      console.log('📋 选择操作:');
      console.log('  1. 停止现有实例并启动新实例');
      console.log('  2. 退出（保持现有实例运行）');
      
      // 在开发环境中，我们直接停止现有实例
      console.log('🛑 正在停止现有实例...');
      await stopExistingInstance();
      return false;
    }
  } catch (error) {
    // 没有实例在运行，继续启动
    return false;
  }
}

// 停止现有实例
async function stopExistingInstance() {
  try {
    // 尝试优雅停止
    await fetch('http://localhost:3000/api/admin/shutdown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    // 等待服务停止
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (error) {
    // 忽略错误，可能服务已经停止
  }
  
  // 强制清理进程
  try {
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    
    // 清理 Node.js 进程
    await execPromise('pkill -f "node.*app.js" || true');
    
    // 清理 Gost 进程
    await execPromise('pkill -f gost || true');
    
    console.log('✅ 现有实例已停止');
  } catch (error) {
    console.log('⚠️ 进程清理可能不完整:', error.message);
  }
}

// 启动应用
function startApp() {
  console.log('🚀 启动 Gost 管理系统开发服务器...');
  
  const nodemon = spawn('npx', ['nodemon', 'app.js'], {
    stdio: 'inherit',
    cwd: __dirname
  });
  
  nodemon.on('error', (error) => {
    console.error('❌ 启动失败:', error);
    process.exit(1);
  });
  
  nodemon.on('close', (code) => {
    console.log(`📋 开发服务器退出，代码: ${code}`);
    process.exit(code);
  });
  
  // 处理退出信号
  process.on('SIGINT', () => {
    console.log('\n🛑 收到退出信号，正在停止服务...');
    nodemon.kill('SIGINT');
  });
  
  process.on('SIGTERM', () => {
    console.log('\n🛑 收到终止信号，正在停止服务...');
    nodemon.kill('SIGTERM');
  });
}

// 主函数
async function main() {
  console.log('🔍 检查开发环境...');
  
  // 检查 Node.js 版本
  const nodeVersion = process.version;
  console.log(`📋 Node.js 版本: ${nodeVersion}`);
  
  // 检查是否在正确的目录
  if (!fs.existsSync('./app.js')) {
    console.error('❌ 错误: 请在 backend 目录中运行此脚本');
    process.exit(1);
  }
  
  // 检查依赖
  if (!fs.existsSync('./node_modules')) {
    console.log('📦 安装依赖...');
    const npm = spawn('npm', ['install'], { stdio: 'inherit' });
    await new Promise((resolve, reject) => {
      npm.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`npm install 失败，退出码: ${code}`));
        }
      });
    });
  }
  
  // 检查现有实例
  await checkExistingInstance();
  
  // 启动应用
  startApp();
}

// 运行主函数
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 启动失败:', error);
    process.exit(1);
  });
}

module.exports = { main, checkExistingInstance, stopExistingInstance };
