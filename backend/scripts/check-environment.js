/**
 * 环境检查脚本
 * 在应用启动时检查系统环境和依赖
 */

const { platformUtils, isWindows, isLinux, getDistro } = require('../utils/platform');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class EnvironmentChecker {
  constructor() {
    this.issues = [];
    this.warnings = [];
    this.info = [];
  }

  /**
   * 运行完整的环境检查
   */
  async runFullCheck() {
    console.log('🔍 开始环境检查...\n');

    // 显示环境信息
    this.showEnvironmentInfo();

    // 检查各个组件
    this.checkNodeJS();
    this.checkGostBinary();
    this.checkDirectories();
    this.checkPermissions();
    this.checkNetworkTools();
    this.checkOptionalDependencies();

    // 显示检查结果
    this.showResults();

    return this.issues.length === 0;
  }

  /**
   * 显示环境信息
   */
  showEnvironmentInfo() {
    console.log('🖥️  系统环境信息:');
    platformUtils.printEnvironmentInfo();
    console.log('');
  }

  /**
   * 检查 Node.js 版本
   */
  checkNodeJS() {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

    if (majorVersion >= 16) {
      this.info.push(`✅ Node.js 版本: ${nodeVersion} (支持)`);
    } else if (majorVersion >= 14) {
      this.warnings.push(`⚠️ Node.js 版本: ${nodeVersion} (建议升级到 16+)`);
    } else {
      this.issues.push(`❌ Node.js 版本: ${nodeVersion} (需要 14+ 版本)`);
    }
  }

  /**
   * 检查 Gost 二进制文件
   */
  checkGostBinary() {
    const gostPath = platformUtils.getGostExecutablePath(path.join(__dirname, '../bin'));
    
    if (fs.existsSync(gostPath)) {
      this.info.push(`✅ Gost 二进制文件: ${gostPath}`);
      
      // 检查执行权限
      if (!isWindows()) {
        try {
          const stats = fs.statSync(gostPath);
          const mode = stats.mode;
          const isExecutable = (mode & parseInt('111', 8)) !== 0;
          
          if (isExecutable) {
            this.info.push(`✅ Gost 执行权限: 正常`);
          } else {
            this.warnings.push(`⚠️ Gost 执行权限: 缺失，将自动修复`);
            try {
              fs.chmodSync(gostPath, '755');
              this.info.push(`✅ Gost 执行权限: 已修复`);
            } catch (error) {
              this.issues.push(`❌ Gost 执行权限: 修复失败 - ${error.message}`);
            }
          }
        } catch (error) {
          this.warnings.push(`⚠️ 无法检查 Gost 执行权限: ${error.message}`);
        }
      }
    } else {
      this.issues.push(`❌ Gost 二进制文件不存在: ${gostPath}`);
      this.info.push(`💡 解决方案: 运行 'npm run install-gost' 安装 Gost`);
    }
  }

  /**
   * 检查必要目录
   */
  checkDirectories() {
    const directories = [
      { path: path.join(__dirname, '../bin'), name: 'bin 目录' },
      { path: path.join(__dirname, '../config'), name: 'config 目录' },
      { path: path.join(__dirname, '../logs'), name: 'logs 目录' },
      { path: path.join(__dirname, '../database'), name: 'database 目录' }
    ];

    directories.forEach(({ path: dirPath, name }) => {
      if (fs.existsSync(dirPath)) {
        this.info.push(`✅ ${name}: ${dirPath}`);
      } else {
        this.warnings.push(`⚠️ ${name}: 不存在，将自动创建`);
        try {
          fs.mkdirSync(dirPath, { recursive: true });
          this.info.push(`✅ ${name}: 已创建`);
        } catch (error) {
          this.issues.push(`❌ ${name}: 创建失败 - ${error.message}`);
        }
      }
    });
  }

  /**
   * 检查文件权限
   */
  checkPermissions() {
    if (isWindows()) {
      this.info.push(`✅ 权限检查: Windows 系统，跳过 Unix 权限检查`);
      return;
    }

    const configDir = path.join(__dirname, '../config');
    const binDir = path.join(__dirname, '../bin');

    try {
      // 检查配置目录权限
      const configStats = fs.statSync(configDir);
      const configMode = (configStats.mode & parseInt('777', 8)).toString(8);
      this.info.push(`✅ 配置目录权限: ${configMode}`);

      // 检查 bin 目录权限
      if (fs.existsSync(binDir)) {
        const binStats = fs.statSync(binDir);
        const binMode = (binStats.mode & parseInt('777', 8)).toString(8);
        this.info.push(`✅ bin 目录权限: ${binMode}`);
      }
    } catch (error) {
      this.warnings.push(`⚠️ 权限检查失败: ${error.message}`);
    }
  }

  /**
   * 检查网络工具
   */
  checkNetworkTools() {
    const tools = [
      { cmd: 'netstat', desc: '网络状态检查工具' },
      { cmd: 'curl', desc: 'HTTP 客户端工具' }
    ];

    if (isLinux()) {
      tools.push(
        { cmd: 'lsof', desc: '端口占用检查工具' },
        { cmd: 'ps', desc: '进程管理工具' }
      );
    }

    tools.forEach(({ cmd, desc }) => {
      if (platformUtils.commandExists(cmd)) {
        this.info.push(`✅ ${desc}: ${cmd} 可用`);
      } else {
        this.warnings.push(`⚠️ ${desc}: ${cmd} 不可用`);
      }
    });
  }

  /**
   * 检查可选依赖
   */
  checkOptionalDependencies() {
    // 检查包管理器
    const packageManager = platformUtils.osInfo.packageManager;
    if (packageManager !== 'unknown') {
      this.info.push(`✅ 包管理器: ${packageManager}`);
    } else {
      this.warnings.push(`⚠️ 包管理器: 未检测到`);
    }

    // 检查防火墙工具
    if (isWindows()) {
      this.info.push(`✅ 防火墙: Windows 防火墙 (netsh)`);
    } else {
      const firewallTools = ['ufw', 'firewall-cmd', 'iptables'];
      const availableTools = firewallTools.filter(tool => platformUtils.commandExists(tool));
      
      if (availableTools.length > 0) {
        this.info.push(`✅ 防火墙工具: ${availableTools.join(', ')}`);
      } else {
        this.warnings.push(`⚠️ 防火墙工具: 未找到 (ufw, firewall-cmd, iptables)`);
      }
    }

    // 检查进程管理器
    if (platformUtils.commandExists('pm2')) {
      this.info.push(`✅ 进程管理器: PM2 可用`);
    } else {
      this.warnings.push(`⚠️ 进程管理器: PM2 不可用 (建议安装: npm install -g pm2)`);
    }
  }

  /**
   * 显示检查结果
   */
  showResults() {
    console.log('\n📋 环境检查结果:');
    console.log('================');

    // 显示错误
    if (this.issues.length > 0) {
      console.log('\n❌ 发现问题:');
      this.issues.forEach(issue => console.log(`   ${issue}`));
    }

    // 显示警告
    if (this.warnings.length > 0) {
      console.log('\n⚠️  警告信息:');
      this.warnings.forEach(warning => console.log(`   ${warning}`));
    }

    // 显示信息
    if (this.info.length > 0) {
      console.log('\n✅ 正常项目:');
      this.info.forEach(info => console.log(`   ${info}`));
    }

    // 总结
    console.log('\n📊 检查总结:');
    console.log(`   ✅ 正常: ${this.info.length} 项`);
    console.log(`   ⚠️  警告: ${this.warnings.length} 项`);
    console.log(`   ❌ 错误: ${this.issues.length} 项`);

    if (this.issues.length === 0) {
      console.log('\n🎉 环境检查通过！系统可以正常运行。');
    } else {
      console.log('\n🚨 环境检查发现问题，请解决后重试。');
    }

    console.log('');
  }

  /**
   * 快速检查（仅检查关键项目）
   */
  quickCheck() {
    const gostPath = platformUtils.getGostExecutablePath(path.join(__dirname, '../bin'));
    const nodeVersion = parseInt(process.version.slice(1).split('.')[0]);

    return {
      nodeOk: nodeVersion >= 14,
      gostOk: fs.existsSync(gostPath),
      platformSupported: isWindows() || isLinux()
    };
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const checker = new EnvironmentChecker();
  checker.runFullCheck().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = {
  EnvironmentChecker,
  checkEnvironment: async () => {
    const checker = new EnvironmentChecker();
    return await checker.runFullCheck();
  },
  quickCheck: () => {
    const checker = new EnvironmentChecker();
    return checker.quickCheck();
  }
};
