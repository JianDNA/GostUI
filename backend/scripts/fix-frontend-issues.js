#!/usr/bin/env node

/**
 * 🔧 前端问题诊断和修复脚本
 * 
 * 功能:
 * 1. 检查前端服务状态
 * 2. 检查后端服务状态
 * 3. 验证端口占用情况
 * 4. 修复常见前端问题
 * 5. 重新启动前端服务
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

class FrontendIssueFixer {
  constructor() {
    this.projectRoot = path.join(__dirname, '../..');
    this.frontendDir = path.join(this.projectRoot, 'frontend');
    this.backendDir = path.join(this.projectRoot, 'backend');
    this.issues = [];
    this.fixes = [];
    
    console.log('🔧 前端问题诊断和修复工具');
    console.log('=' .repeat(60));
  }

  /**
   * 主修复流程
   */
  async fix() {
    try {
      console.log(`📁 项目根目录: ${this.projectRoot}`);
      
      // 1. 检查服务状态
      await this.checkServiceStatus();
      
      // 2. 检查端口占用
      await this.checkPortUsage();
      
      // 3. 检查前端配置
      await this.checkFrontendConfig();
      
      // 4. 检查后端状态
      await this.checkBackendStatus();
      
      // 5. 修复发现的问题
      await this.fixIdentifiedIssues();
      
      // 6. 重新启动服务
      await this.restartServices();
      
      // 7. 验证修复结果
      await this.verifyFix();
      
      console.log('\n🎉 前端问题诊断和修复完成！');
      
    } catch (error) {
      console.error('\n❌ 修复失败:', error);
      throw error;
    }
  }

  /**
   * 检查服务状态
   */
  async checkServiceStatus() {
    console.log('\n🔍 检查服务状态...');
    
    // 检查前端服务 (端口8080)
    const frontendRunning = await this.checkPort(8080);
    console.log(`📱 前端服务 (8080): ${frontendRunning ? '✅ 运行中' : '❌ 未运行'}`);
    
    if (!frontendRunning) {
      this.issues.push({
        type: 'frontend_not_running',
        description: '前端服务未运行',
        port: 8080
      });
    }
    
    // 检查后端服务 (端口3000)
    const backendRunning = await this.checkPort(3000);
    console.log(`🔧 后端服务 (3000): ${backendRunning ? '✅ 运行中' : '❌ 未运行'}`);
    
    if (!backendRunning) {
      this.issues.push({
        type: 'backend_not_running',
        description: '后端服务未运行',
        port: 3000
      });
    }
  }

  /**
   * 检查端口是否被占用
   */
  async checkPort(port) {
    return new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port: port,
        method: 'GET',
        timeout: 1000
      }, (res) => {
        resolve(true);
      });
      
      req.on('error', () => {
        resolve(false);
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      
      req.end();
    });
  }

  /**
   * 检查端口占用情况
   */
  async checkPortUsage() {
    console.log('\n🔍 检查端口占用情况...');
    
    try {
      // 检查端口8080占用
      const port8080 = await this.getPortProcess(8080);
      console.log(`📱 端口8080: ${port8080 || '未占用'}`);
      
      // 检查端口3000占用
      const port3000 = await this.getPortProcess(3000);
      console.log(`🔧 端口3000: ${port3000 || '未占用'}`);
      
    } catch (error) {
      console.warn(`⚠️ 端口检查失败: ${error.message}`);
    }
  }

  /**
   * 获取占用端口的进程
   */
  async getPortProcess(port) {
    return new Promise((resolve) => {
      exec(`lsof -ti:${port}`, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve(null);
          return;
        }
        
        const pid = stdout.trim();
        exec(`ps -p ${pid} -o comm=`, (error, stdout) => {
          resolve(stdout.trim() || `PID: ${pid}`);
        });
      });
    });
  }

  /**
   * 检查前端配置
   */
  async checkFrontendConfig() {
    console.log('\n📱 检查前端配置...');
    
    // 检查package.json
    const packagePath = path.join(this.frontendDir, 'package.json');
    if (fs.existsSync(packagePath)) {
      console.log('✅ package.json 存在');
      
      try {
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        if (packageJson.scripts && packageJson.scripts.dev) {
          console.log('✅ dev 脚本配置正确');
        } else {
          this.issues.push({
            type: 'missing_dev_script',
            description: 'package.json 缺少 dev 脚本'
          });
        }
      } catch (error) {
        this.issues.push({
          type: 'invalid_package_json',
          description: 'package.json 格式错误'
        });
      }
    } else {
      this.issues.push({
        type: 'missing_package_json',
        description: '前端 package.json 不存在'
      });
    }
    
    // 检查vite.config.js
    const viteConfigPath = path.join(this.frontendDir, 'vite.config.js');
    if (fs.existsSync(viteConfigPath)) {
      console.log('✅ vite.config.js 存在');
    } else {
      this.issues.push({
        type: 'missing_vite_config',
        description: 'vite.config.js 不存在'
      });
    }
    
    // 检查node_modules
    const nodeModulesPath = path.join(this.frontendDir, 'node_modules');
    if (fs.existsSync(nodeModulesPath)) {
      console.log('✅ node_modules 存在');
    } else {
      this.issues.push({
        type: 'missing_node_modules',
        description: '前端依赖未安装'
      });
    }
  }

  /**
   * 检查后端状态
   */
  async checkBackendStatus() {
    console.log('\n🔧 检查后端状态...');
    
    // 检查后端主文件
    const appPath = path.join(this.backendDir, 'app.js');
    if (fs.existsSync(appPath)) {
      console.log('✅ 后端 app.js 存在');
    } else {
      this.issues.push({
        type: 'missing_backend_app',
        description: '后端 app.js 不存在'
      });
    }
    
    // 检查后端依赖
    const backendNodeModules = path.join(this.backendDir, 'node_modules');
    if (fs.existsSync(backendNodeModules)) {
      console.log('✅ 后端 node_modules 存在');
    } else {
      this.issues.push({
        type: 'missing_backend_deps',
        description: '后端依赖未安装'
      });
    }
  }

  /**
   * 修复发现的问题
   */
  async fixIdentifiedIssues() {
    console.log('\n🔧 修复发现的问题...');
    
    if (this.issues.length === 0) {
      console.log('✅ 未发现需要修复的问题');
      return;
    }
    
    for (const issue of this.issues) {
      console.log(`🔧 修复: ${issue.description}`);
      
      switch (issue.type) {
        case 'missing_node_modules':
          await this.installFrontendDependencies();
          break;
          
        case 'missing_backend_deps':
          await this.installBackendDependencies();
          break;
          
        case 'frontend_not_running':
          // 将在 restartServices 中处理
          break;
          
        case 'backend_not_running':
          // 将在 restartServices 中处理
          break;
          
        default:
          console.log(`⚠️ 未知问题类型: ${issue.type}`);
      }
    }
  }

  /**
   * 安装前端依赖
   */
  async installFrontendDependencies() {
    console.log('📦 安装前端依赖...');
    
    return new Promise((resolve, reject) => {
      const npm = spawn('npm', ['install'], {
        cwd: this.frontendDir,
        stdio: 'inherit'
      });
      
      npm.on('close', (code) => {
        if (code === 0) {
          console.log('✅ 前端依赖安装完成');
          this.fixes.push('安装前端依赖');
          resolve();
        } else {
          reject(new Error(`前端依赖安装失败，退出码: ${code}`));
        }
      });
    });
  }

  /**
   * 安装后端依赖
   */
  async installBackendDependencies() {
    console.log('📦 安装后端依赖...');
    
    return new Promise((resolve, reject) => {
      const npm = spawn('npm', ['install'], {
        cwd: this.backendDir,
        stdio: 'inherit'
      });
      
      npm.on('close', (code) => {
        if (code === 0) {
          console.log('✅ 后端依赖安装完成');
          this.fixes.push('安装后端依赖');
          resolve();
        } else {
          reject(new Error(`后端依赖安装失败，退出码: ${code}`));
        }
      });
    });
  }

  /**
   * 重新启动服务
   */
  async restartServices() {
    console.log('\n🚀 重新启动服务...');
    
    // 检查是否需要启动后端
    const backendRunning = await this.checkPort(3000);
    if (!backendRunning) {
      console.log('🔧 启动后端服务...');
      await this.startBackend();
    }
    
    // 检查是否需要启动前端
    const frontendRunning = await this.checkPort(8080);
    if (!frontendRunning) {
      console.log('📱 启动前端服务...');
      await this.startFrontend();
    }
  }

  /**
   * 启动后端服务
   */
  async startBackend() {
    console.log('🔧 启动后端服务...');
    
    const backend = spawn('node', ['app.js'], {
      cwd: this.backendDir,
      detached: true,
      stdio: 'ignore'
    });
    
    backend.unref();
    
    // 等待后端启动
    await this.waitForService(3000, 10000);
    console.log('✅ 后端服务已启动');
    this.fixes.push('启动后端服务');
  }

  /**
   * 启动前端服务
   */
  async startFrontend() {
    console.log('📱 启动前端服务...');
    
    const frontend = spawn('npm', ['run', 'dev'], {
      cwd: this.frontendDir,
      detached: true,
      stdio: 'ignore'
    });
    
    frontend.unref();
    
    // 等待前端启动
    await this.waitForService(8080, 15000);
    console.log('✅ 前端服务已启动');
    this.fixes.push('启动前端服务');
  }

  /**
   * 等待服务启动
   */
  async waitForService(port, timeout = 10000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const running = await this.checkPort(port);
      if (running) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`服务启动超时 (端口 ${port})`);
  }

  /**
   * 验证修复结果
   */
  async verifyFix() {
    console.log('\n✅ 验证修复结果...');
    
    // 检查前端服务
    const frontendRunning = await this.checkPort(8080);
    console.log(`📱 前端服务 (8080): ${frontendRunning ? '✅ 正常运行' : '❌ 仍未运行'}`);
    
    // 检查后端服务
    const backendRunning = await this.checkPort(3000);
    console.log(`🔧 后端服务 (3000): ${backendRunning ? '✅ 正常运行' : '❌ 仍未运行'}`);
    
    if (frontendRunning && backendRunning) {
      console.log('\n🎉 所有服务正常运行！');
      console.log('🌐 前端访问地址: http://localhost:8080');
      console.log('🔧 后端API地址: http://localhost:3000');
    } else {
      console.log('\n⚠️ 部分服务仍有问题，请手动检查');
    }
    
    // 生成修复报告
    await this.generateFixReport();
  }

  /**
   * 生成修复报告
   */
  async generateFixReport() {
    const report = {
      timestamp: new Date().toISOString(),
      issues_found: this.issues.length,
      fixes_applied: this.fixes.length,
      issues: this.issues,
      fixes: this.fixes,
      final_status: {
        frontend_running: await this.checkPort(8080),
        backend_running: await this.checkPort(3000)
      }
    };
    
    const reportPath = path.join(this.backendDir, 'backups', `frontend_fix_report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    
    // 确保备份目录存在
    const backupDir = path.dirname(reportPath);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📊 修复报告已生成: ${path.basename(reportPath)}`);
  }
}

// 主程序
async function main() {
  const fixer = new FrontendIssueFixer();
  
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

module.exports = FrontendIssueFixer;
