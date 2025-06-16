#!/usr/bin/env node

/**
 * ✅ 项目状态验证脚本
 * 
 * 功能:
 * 1. 验证项目结构完整性
 * 2. 检查核心文件存在性
 * 3. 验证数据库状态
 * 4. 检查服务可用性
 * 5. 生成项目健康报告
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class ProjectStatusVerifier {
  constructor() {
    this.projectRoot = path.join(__dirname, '../..');
    this.issues = [];
    this.checks = [];
    
    console.log('✅ 项目状态验证工具');
    console.log('=' .repeat(60));
  }

  /**
   * 主验证流程
   */
  async verify() {
    try {
      console.log(`📁 项目根目录: ${this.projectRoot}`);
      
      // 1. 验证项目结构
      await this.verifyProjectStructure();
      
      // 2. 验证核心文件
      await this.verifyCoreFiles();
      
      // 3. 验证数据库状态
      await this.verifyDatabaseStatus();
      
      // 4. 验证依赖安装
      await this.verifyDependencies();
      
      // 5. 验证配置文件
      await this.verifyConfigurations();
      
      // 6. 生成健康报告
      await this.generateHealthReport();
      
      console.log('\n🎉 项目状态验证完成！');
      
      if (this.issues.length === 0) {
        console.log('✅ 项目状态完全正常，可以安全部署！');
      } else {
        console.log(`⚠️ 发现 ${this.issues.length} 个问题需要处理`);
      }
      
    } catch (error) {
      console.error('\n❌ 验证失败:', error);
      throw error;
    }
  }

  /**
   * 验证项目结构
   */
  async verifyProjectStructure() {
    console.log('\n🏗️ 验证项目结构...');
    
    const expectedStructure = {
      'backend': 'directory',
      'frontend': 'directory', 
      'scripts': 'directory',
      'README.md': 'file',
      'USAGE_GUIDE.md': 'file',
      'RELEASE_INFO.json': 'file'
    };
    
    for (const [item, type] of Object.entries(expectedStructure)) {
      const itemPath = path.join(this.projectRoot, item);
      
      if (fs.existsSync(itemPath)) {
        const stats = fs.statSync(itemPath);
        const actualType = stats.isDirectory() ? 'directory' : 'file';
        
        if (actualType === type) {
          this.addCheck(`✅ ${item}`, 'structure', 'pass');
        } else {
          this.addIssue(`❌ ${item} 类型错误 (期望: ${type}, 实际: ${actualType})`, 'structure');
        }
      } else {
        this.addIssue(`❌ ${item} 不存在`, 'structure');
      }
    }
    
    console.log('✅ 项目结构验证完成');
  }

  /**
   * 验证核心文件
   */
  async verifyCoreFiles() {
    console.log('\n📄 验证核心文件...');
    
    const coreFiles = [
      'backend/app.js',
      'backend/package.json',
      'backend/complete_schema.sql',
      'frontend/package.json',
      'frontend/vite.config.js',
      'scripts/start.sh',
      'scripts/start.bat'
    ];
    
    for (const file of coreFiles) {
      const filePath = path.join(this.projectRoot, file);
      
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        
        if (stats.size > 0) {
          this.addCheck(`✅ ${file}`, 'core_files', 'pass');
        } else {
          this.addIssue(`❌ ${file} 文件为空`, 'core_files');
        }
      } else {
        this.addIssue(`❌ ${file} 不存在`, 'core_files');
      }
    }
    
    console.log('✅ 核心文件验证完成');
  }

  /**
   * 验证数据库状态
   */
  async verifyDatabaseStatus() {
    console.log('\n💾 验证数据库状态...');
    
    const dbPath = path.join(this.projectRoot, 'backend/database/database.sqlite');
    
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      
      if (stats.size > 0) {
        this.addCheck(`✅ 数据库文件存在 (${(stats.size / 1024).toFixed(1)} KB)`, 'database', 'pass');
        
        // 检查数据库表
        try {
          const { sequelize } = require('../models');
          await sequelize.authenticate();
          
          const [tables] = await sequelize.query(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
          );
          
          this.addCheck(`✅ 数据库连接正常 (${tables.length} 个表)`, 'database', 'pass');
          
          // 检查关键表
          const criticalTables = ['Users', 'UserForwardRules', 'SystemConfigs'];
          for (const table of criticalTables) {
            if (tables.some(t => t.name === table)) {
              this.addCheck(`✅ 关键表 ${table} 存在`, 'database', 'pass');
            } else {
              this.addIssue(`❌ 关键表 ${table} 缺失`, 'database');
            }
          }
          
        } catch (error) {
          this.addIssue(`❌ 数据库连接失败: ${error.message}`, 'database');
        }
      } else {
        this.addIssue(`❌ 数据库文件为空`, 'database');
      }
    } else {
      this.addIssue(`❌ 数据库文件不存在`, 'database');
    }
    
    console.log('✅ 数据库状态验证完成');
  }

  /**
   * 验证依赖安装
   */
  async verifyDependencies() {
    console.log('\n📦 验证依赖安装...');
    
    const nodeModulesPaths = [
      'backend/node_modules',
      'frontend/node_modules'
    ];
    
    for (const nmPath of nodeModulesPaths) {
      const fullPath = path.join(this.projectRoot, nmPath);
      
      if (fs.existsSync(fullPath)) {
        const packages = fs.readdirSync(fullPath).filter(p => !p.startsWith('.'));
        this.addCheck(`✅ ${nmPath} (${packages.length} 个包)`, 'dependencies', 'pass');
      } else {
        this.addIssue(`❌ ${nmPath} 不存在，需要运行 npm install`, 'dependencies');
      }
    }
    
    console.log('✅ 依赖安装验证完成');
  }

  /**
   * 验证配置文件
   */
  async verifyConfigurations() {
    console.log('\n⚙️ 验证配置文件...');
    
    const configFiles = [
      'backend/config/config.js',
      'backend/config/database.js',
      'backend/config/system-performance.json'
    ];
    
    for (const configFile of configFiles) {
      const filePath = path.join(this.projectRoot, configFile);
      
      if (fs.existsSync(filePath)) {
        try {
          if (configFile.endsWith('.json')) {
            JSON.parse(fs.readFileSync(filePath, 'utf8'));
          }
          this.addCheck(`✅ ${configFile}`, 'configuration', 'pass');
        } catch (error) {
          this.addIssue(`❌ ${configFile} 格式错误: ${error.message}`, 'configuration');
        }
      } else {
        this.addIssue(`❌ ${configFile} 不存在`, 'configuration');
      }
    }
    
    console.log('✅ 配置文件验证完成');
  }

  /**
   * 生成健康报告
   */
  async generateHealthReport() {
    console.log('\n📊 生成项目健康报告...');
    
    const report = {
      timestamp: new Date().toISOString(),
      project_name: 'GOST 代理管理系统',
      version: '1.0.0',
      overall_status: this.issues.length === 0 ? 'HEALTHY' : 'NEEDS_ATTENTION',
      summary: {
        total_checks: this.checks.length,
        passed_checks: this.checks.filter(c => c.status === 'pass').length,
        total_issues: this.issues.length,
        health_score: Math.round((this.checks.filter(c => c.status === 'pass').length / this.checks.length) * 100)
      },
      checks_by_category: this.groupChecksByCategory(),
      issues_by_category: this.groupIssuesByCategory(),
      detailed_checks: this.checks,
      detailed_issues: this.issues,
      recommendations: this.generateRecommendations(),
      deployment_readiness: {
        ready: this.issues.length === 0,
        blockers: this.issues.filter(i => i.severity === 'critical'),
        warnings: this.issues.filter(i => i.severity === 'warning')
      }
    };
    
    const reportPath = path.join(this.projectRoot, 'backend/backups', `health_report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    
    // 确保备份目录存在
    const backupDir = path.dirname(reportPath);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`✅ 健康报告已生成: ${path.basename(reportPath)}`);
    console.log('📊 项目健康摘要:');
    console.log(`   - 健康评分: ${report.summary.health_score}%`);
    console.log(`   - 通过检查: ${report.summary.passed_checks}/${report.summary.total_checks}`);
    console.log(`   - 发现问题: ${report.summary.total_issues} 个`);
    console.log(`   - 部署就绪: ${report.deployment_readiness.ready ? '是' : '否'}`);
  }

  /**
   * 添加检查结果
   */
  addCheck(message, category, status) {
    this.checks.push({
      message,
      category,
      status,
      timestamp: new Date().toISOString()
    });
    console.log(`   ${message}`);
  }

  /**
   * 添加问题
   */
  addIssue(message, category, severity = 'warning') {
    this.issues.push({
      message,
      category,
      severity,
      timestamp: new Date().toISOString()
    });
    console.log(`   ${message}`);
  }

  /**
   * 按类别分组检查
   */
  groupChecksByCategory() {
    const grouped = {};
    for (const check of this.checks) {
      if (!grouped[check.category]) {
        grouped[check.category] = { pass: 0, fail: 0 };
      }
      grouped[check.category][check.status]++;
    }
    return grouped;
  }

  /**
   * 按类别分组问题
   */
  groupIssuesByCategory() {
    const grouped = {};
    for (const issue of this.issues) {
      if (!grouped[issue.category]) {
        grouped[issue.category] = [];
      }
      grouped[issue.category].push(issue.message);
    }
    return grouped;
  }

  /**
   * 生成建议
   */
  generateRecommendations() {
    const recommendations = [];
    
    if (this.issues.some(i => i.category === 'dependencies')) {
      recommendations.push('运行 npm install 安装缺失的依赖');
    }
    
    if (this.issues.some(i => i.category === 'database')) {
      recommendations.push('运行数据库初始化脚本修复数据库问题');
    }
    
    if (this.issues.some(i => i.category === 'configuration')) {
      recommendations.push('检查并修复配置文件格式错误');
    }
    
    if (this.issues.length === 0) {
      recommendations.push('项目状态良好，可以安全部署');
      recommendations.push('建议定期运行此验证脚本确保项目健康');
    }
    
    return recommendations;
  }
}

// 主程序
async function main() {
  const verifier = new ProjectStatusVerifier();
  
  try {
    await verifier.verify();
    process.exit(0);
  } catch (error) {
    console.error('\n💥 验证失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = ProjectStatusVerifier;
