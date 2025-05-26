/**
 * Go-Gost 测试脚本
 */

const gostService = require('../services/gostService');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

async function testGost() {
  try {
    console.log('===== Go-Gost 测试脚本 =====');
    
    // 1. 检查是否安装
    console.log('1. 检查 Go-Gost 是否已安装...');
    await gostService.ensureExecutable();
    console.log('√ Go-Gost 已安装');
    
    // 2. 关闭已有进程
    console.log('\n2. 关闭已有 Go-Gost 进程...');
    await gostService.killExistingProcess();
    console.log('√ 已关闭所有 Go-Gost 进程');
    
    // 3. 启动服务
    console.log('\n3. 启动 Go-Gost 服务...');
    await gostService.startWithConfig();
    console.log('√ Go-Gost 服务已启动');
    
    // 4. 检查状态
    console.log('\n4. 检查 Go-Gost 服务状态...');
    const status = gostService.getStatus();
    console.log('状态:', status);
    
    if (status.isRunning) {
      console.log('√ Go-Gost 服务运行中');
    } else {
      console.log('× Go-Gost 服务未运行');
    }
    
    // 5. 检查端口
    console.log('\n5. 检查 Go-Gost 服务端口...');
    try {
      // 检查 6443 端口（转发端口）
      const { stdout: stdout1 } = await exec('netstat -ano | findstr 6443');
      console.log('端口 6443 监听状态:');
      console.log(stdout1);
      
      // 检查 8090 端口（HTTP代理）
      const { stdout: stdout2 } = await exec('netstat -ano | findstr 8090');
      console.log('端口 8090 监听状态:');
      console.log(stdout2);
      
      console.log('√ 端口检查完成');
    } catch (error) {
      console.log('× 未找到监听的端口:', error.message);
    }
    
    // 6. 停止服务
    console.log('\n6. 停止 Go-Gost 服务...');
    gostService.stop();
    console.log('√ Go-Gost 服务已停止');
    
    console.log('\n===== 测试完成 =====');
  } catch (error) {
    console.error('测试失败:', error);
  }
}

// 执行测试
testGost(); 