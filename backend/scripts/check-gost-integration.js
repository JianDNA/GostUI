/**
 * Gost 集成检查脚本
 * 检查所有必要的文件、配置和依赖是否正确设置
 *
 * ⚠️ 安全警告: 此脚本仅用于开发和测试环境，禁止在生产环境中运行！
 */

const fs = require('fs');
const path = require('path');

// 🔒 生产环境安全检查
function checkProductionSafety() {
  const env = process.env.NODE_ENV || 'development';

  if (env === 'production') {
    console.error('🚨 安全警告: 此测试脚本禁止在生产环境中运行！');
    console.error('   当前环境: production');
    console.error('   请在开发或测试环境中运行此脚本。');
    console.error('   如需在生产环境中检查系统状态，请使用专门的监控工具。');
    process.exit(1);
  }

  // 额外检查：如果检测到生产环境的特征，也拒绝运行
  const productionIndicators = [
    process.env.PM2_HOME,
    process.env.PRODUCTION,
    process.env.PROD
  ];

  if (productionIndicators.some(indicator => indicator)) {
    console.error('🚨 安全警告: 检测到生产环境特征，拒绝运行测试脚本！');
    process.exit(1);
  }

  console.log(`✅ 环境检查通过 (当前环境: ${env})`);
}

class GostIntegrationChecker {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.success = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}]`;

    switch (type) {
      case 'error':
        this.errors.push(message);
        console.error(`${prefix} ❌ ${message}`);
        break;
      case 'warning':
        this.warnings.push(message);
        console.warn(`${prefix} ⚠️  ${message}`);
        break;
      case 'success':
        this.success.push(message);
        console.log(`${prefix} ✅ ${message}`);
        break;
      default:
        console.log(`${prefix} ℹ️  ${message}`);
    }
  }

  checkFileExists(filePath, description) {
    if (fs.existsSync(filePath)) {
      this.log(`${description} 存在: ${filePath}`, 'success');
      return true;
    } else {
      this.log(`${description} 不存在: ${filePath}`, 'error');
      return false;
    }
  }

  checkDirectoryExists(dirPath, description) {
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      this.log(`${description} 目录存在: ${dirPath}`, 'success');
      return true;
    } else {
      this.log(`${description} 目录不存在: ${dirPath}`, 'error');
      return false;
    }
  }

  checkConfigFile(filePath, requiredKeys = []) {
    if (!this.checkFileExists(filePath, '配置文件')) {
      return false;
    }

    try {
      const config = require(filePath);
      this.log('配置文件格式正确', 'success');

      for (const key of requiredKeys) {
        if (config[key] !== undefined) {
          this.log(`配置项 ${key} 存在`, 'success');
        } else {
          this.log(`配置项 ${key} 缺失`, 'error');
        }
      }
      return true;
    } catch (error) {
      this.log(`配置文件格式错误: ${error.message}`, 'error');
      return false;
    }
  }

  async checkDatabaseConnection() {
    try {
      const { initDb } = require('../services/dbService');
      await initDb();
      this.log('数据库连接正常', 'success');
      return true;
    } catch (error) {
      this.log(`数据库连接失败: ${error.message}`, 'error');
      return false;
    }
  }

  checkModelAssociations() {
    try {
      const { models } = require('../services/dbService');

      // 检查用户模型
      if (models.User) {
        this.log('User 模型加载成功', 'success');

        // 检查关键方法
        const userInstance = new models.User();
        if (typeof userInstance.isPortInRange === 'function') {
          this.log('User.isPortInRange 方法存在', 'success');
        } else {
          this.log('User.isPortInRange 方法缺失', 'error');
        }
      } else {
        this.log('User 模型缺失', 'error');
      }

      // 检查转发规则模型
      if (models.UserForwardRule) {
        this.log('UserForwardRule 模型加载成功', 'success');
      } else {
        this.log('UserForwardRule 模型缺失', 'error');
      }

      return true;
    } catch (error) {
      this.log(`模型检查失败: ${error.message}`, 'error');
      return false;
    }
  }

  checkGostConfigService() {
    try {
      const gostConfigService = require('../services/gostConfigService');

      // 检查关键方法
      const methods = [
        'generateGostConfig',
        'syncConfig',
        'startAutoSync',
        'stopAutoSync',
        'triggerSync'
      ];

      for (const method of methods) {
        if (typeof gostConfigService[method] === 'function') {
          this.log(`GostConfigService.${method} 方法存在`, 'success');
        } else {
          this.log(`GostConfigService.${method} 方法缺失`, 'error');
        }
      }

      return true;
    } catch (error) {
      this.log(`GostConfigService 检查失败: ${error.message}`, 'error');
      return false;
    }
  }

  checkRoutes() {
    try {
      // 检查路由文件
      const routeFiles = [
        '../routes/gostConfig.js',
        '../routes/users.js',
        '../routes/userForwardRules.js'
      ];

      for (const routeFile of routeFiles) {
        this.checkFileExists(path.resolve(__dirname, routeFile), `路由文件 ${routeFile}`);
      }

      return true;
    } catch (error) {
      this.log(`路由检查失败: ${error.message}`, 'error');
      return false;
    }
  }

  async runAllChecks() {
    // 🔒 首先进行安全检查
    checkProductionSafety();

    console.log('🔍 开始 Gost 集成检查...\n');

    // 1. 检查核心文件
    this.log('=== 检查核心文件 ===');
    this.checkFileExists(path.resolve(__dirname, '../config/config.js'), '主配置文件');
    this.checkFileExists(path.resolve(__dirname, '../services/gostConfigService.js'), 'Gost配置服务');
    this.checkFileExists(path.resolve(__dirname, '../services/gostService.js'), 'Gost服务');
    this.checkFileExists(path.resolve(__dirname, '../services/dbService.js'), '数据库服务');

    // 2. 检查目录结构
    this.log('\n=== 检查目录结构 ===');
    this.checkDirectoryExists(path.resolve(__dirname, '../config'), '配置目录');
    this.checkDirectoryExists(path.resolve(__dirname, '../services'), '服务目录');
    this.checkDirectoryExists(path.resolve(__dirname, '../routes'), '路由目录');
    this.checkDirectoryExists(path.resolve(__dirname, '../models'), '模型目录');

    // 3. 检查配置文件
    this.log('\n=== 检查配置文件 ===');
    this.checkConfigFile(
      path.resolve(__dirname, '../config/config.js'),
      ['server', 'jwt', 'database', 'gost']
    );

    // 4. 检查数据库连接
    this.log('\n=== 检查数据库连接 ===');
    await this.checkDatabaseConnection();

    // 5. 检查模型关联
    this.log('\n=== 检查模型关联 ===');
    this.checkModelAssociations();

    // 6. 检查服务
    this.log('\n=== 检查服务 ===');
    this.checkGostConfigService();

    // 7. 检查路由
    this.log('\n=== 检查路由 ===');
    this.checkRoutes();

    // 8. 生成报告
    this.generateReport();
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 检查报告');
    console.log('='.repeat(60));

    console.log(`✅ 成功项目: ${this.success.length}`);
    console.log(`⚠️  警告项目: ${this.warnings.length}`);
    console.log(`❌ 错误项目: ${this.errors.length}`);

    if (this.warnings.length > 0) {
      console.log('\n⚠️  警告详情:');
      this.warnings.forEach((warning, index) => {
        console.log(`  ${index + 1}. ${warning}`);
      });
    }

    if (this.errors.length > 0) {
      console.log('\n❌ 错误详情:');
      this.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });

      console.log('\n🔧 建议修复步骤:');
      console.log('  1. 检查缺失的文件和目录');
      console.log('  2. 确保所有依赖已正确安装');
      console.log('  3. 检查配置文件格式');
      console.log('  4. 运行数据库迁移');
    } else {
      console.log('\n🎉 所有检查通过！Gost 集成配置正确。');
    }

    console.log('='.repeat(60));
  }
}

// 运行检查
if (require.main === module) {
  const checker = new GostIntegrationChecker();
  checker.runAllChecks()
    .then(() => {
      process.exit(checker.errors.length > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('检查过程中发生错误:', error);
      process.exit(1);
    });
}

module.exports = GostIntegrationChecker;
