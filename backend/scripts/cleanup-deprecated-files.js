#!/usr/bin/env node

/**
 * 🗑️ 废弃文件清理脚本
 * 
 * 功能:
 * 1. 清理根目录的测试脚本
 * 2. 清理重复的文档文件
 * 3. 清理临时调试文件
 * 4. 清理废弃的配置文件
 * 5. 整理项目结构
 * 6. 生成清理报告
 */

const fs = require('fs');
const path = require('path');

class DeprecatedFilesCleaner {
  constructor() {
    this.projectRoot = path.join(__dirname, '../..');
    this.cleanedFiles = [];
    this.archivedFiles = [];
    this.errors = [];
    
    console.log('🗑️ 废弃文件清理工具');
    console.log('=' .repeat(60));
  }

  /**
   * 主清理流程
   */
  async clean() {
    try {
      console.log(`📁 项目根目录: ${this.projectRoot}`);
      
      // 1. 清理根目录测试脚本
      await this.cleanRootTestScripts();
      
      // 2. 清理重复文档
      await this.cleanDuplicateDocuments();
      
      // 3. 清理临时文件
      await this.cleanTemporaryFiles();
      
      // 4. 清理废弃配置
      await this.cleanDeprecatedConfigs();
      
      // 5. 清理后端临时文件
      await this.cleanBackendTemporaryFiles();
      
      // 6. 清理过时备份
      await this.cleanOldBackups();
      
      // 7. 生成清理报告
      await this.generateCleanupReport();
      
      console.log('\n🎉 废弃文件清理完成！');
      console.log(`📊 清理统计: ${this.cleanedFiles.length} 个文件已删除`);
      
    } catch (error) {
      console.error('\n❌ 清理失败:', error);
      throw error;
    }
  }

  /**
   * 清理根目录测试脚本
   */
  async cleanRootTestScripts() {
    console.log('\n🧪 清理根目录测试脚本...');
    
    const testScripts = [
      // 流量测试脚本
      'check-traffic.js',
      'comprehensive_traffic_control_test.sh',
      'comprehensive_traffic_test.sh',
      'create-test-rule.js',
      'debug_traffic_test.sh',
      'fix-traffic-bugs.js',
      'intensive_traffic_control_test.sh',
      'monitor-observer-direct.js',
      'monitor-observer.js',
      'quick-traffic-test.js',
      'quick_reset_test.sh',
      'simple-observer-monitor.js',
      'simple-traffic-test.js',
      'simple_traffic_test.sh',
      'test-observer-periods.sh',
      'test_frontend_changes.html',
      'test_traffic_control.sh',
      'test_traffic_fix.sh',
      'traffic_accuracy_test.js',
      'traffic_control_test.sh',
      'update-observer-period.js',
      
      // 配置和重启脚本
      'restart-gost.js',
      'restore-config.js',
      'restore-observer-config.js',
      'gost.sh',
      
      // 重复的启动脚本
      'start.bat',
      'start.sh',
      
      // 废弃的配置文件
      'ecosystem.config.js',
      'package.json',
      'package-lock.json'
    ];
    
    for (const script of testScripts) {
      const filePath = path.join(this.projectRoot, script);
      await this.safeDelete(filePath, '根目录测试脚本');
    }
    
    console.log(`✅ 清理根目录测试脚本: ${testScripts.length} 个文件`);
  }

  /**
   * 清理重复文档
   */
  async cleanDuplicateDocuments() {
    console.log('\n📄 清理重复文档...');
    
    const duplicateDocs = [
      // 保留主要文档，删除重复的
      'DEPLOYMENT.md',
      'DOCUMENTATION_INDEX.md', 
      'DOCUMENTATION_SUMMARY.md',
      'GOST_INTEGRATION.md',
      'ISSUE_RESOLUTION.md',
      'PRODUCTION_SECURITY.md',
      'PROJECT_INITIALIZATION_COMPLETE.md',
      'QUICK_START.md',
      'RELEASE_PREPARATION.md',
      'STOP_UNINSTALL_GUIDE.md',
      'TESTING.md',
      'TRAFFIC_BUG_FIX_GUIDE.md',
      'TRAFFIC_LIMIT_BUG_FIX.md',
      
      // 后端重复文档
      'backend/CODE_CLEANUP_SUMMARY.md',
      'backend/SCRIPTS_README.md',
      'backend/performance-optimization-plan.md'
    ];
    
    for (const doc of duplicateDocs) {
      const filePath = path.join(this.projectRoot, doc);
      await this.safeDelete(filePath, '重复文档');
    }
    
    console.log(`✅ 清理重复文档: ${duplicateDocs.length} 个文件`);
  }

  /**
   * 清理临时文件
   */
  async cleanTemporaryFiles() {
    console.log('\n🗑️ 清理临时文件...');
    
    const tempFiles = [
      'backend/check-port-mapping.js',
      'backend/check-user-quota.js',
      'backend/fix-port-mapping-simple.js',
      'backend/start-dev.js',
      'backend/database.sqlite',
      'backend/current_db_schema.sql'
    ];
    
    for (const file of tempFiles) {
      const filePath = path.join(this.projectRoot, file);
      await this.safeDelete(filePath, '临时文件');
    }
    
    console.log(`✅ 清理临时文件: ${tempFiles.length} 个文件`);
  }

  /**
   * 清理废弃配置
   */
  async cleanDeprecatedConfigs() {
    console.log('\n⚙️ 清理废弃配置...');
    
    const deprecatedConfigs = [
      'backend/config/gost-config-fixed.json',
      'backend/config/gost-config-with-recorder.json',
      'backend/config/gost-config.json.backup',
      'backend/config/port-forward-example.json',
      'backend/config/system-performance.backup.json',
      'backend/ecosystem.config.js',
      'backend/nodemon.json'
    ];
    
    for (const config of deprecatedConfigs) {
      const filePath = path.join(this.projectRoot, config);
      await this.safeDelete(filePath, '废弃配置');
    }
    
    console.log(`✅ 清理废弃配置: ${deprecatedConfigs.length} 个文件`);
  }

  /**
   * 清理后端临时文件
   */
  async cleanBackendTemporaryFiles() {
    console.log('\n🔧 清理后端临时文件...');
    
    const backendTempFiles = [
      'backend/scripts/clean-report.json',
      'backend/scripts/fix-database-schema.js',
      'backend/scripts/fix-startup-issues.js',
      'backend/scripts/init-db.js',
      'backend/scripts/init-time-series.js',
      'backend/scripts/port-forward-test.js',
      'backend/scripts/reset-port.js',
      'backend/scripts/reset-traffic-data.js',
      'backend/scripts/start-dev.js'
    ];
    
    for (const file of backendTempFiles) {
      const filePath = path.join(this.projectRoot, file);
      await this.safeDelete(filePath, '后端临时文件');
    }
    
    console.log(`✅ 清理后端临时文件: ${backendTempFiles.length} 个文件`);
  }

  /**
   * 清理过时备份
   */
  async cleanOldBackups() {
    console.log('\n💾 清理过时备份...');
    
    const backupDir = path.join(this.projectRoot, 'backend/backups');
    
    if (fs.existsSync(backupDir)) {
      const files = fs.readdirSync(backupDir);
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      let cleanedBackups = 0;
      
      for (const file of files) {
        const filePath = path.join(backupDir, file);
        const stats = fs.statSync(filePath);
        
        // 保留最近一周的备份
        if (stats.mtime < oneWeekAgo && file.includes('database_backup_')) {
          await this.safeDelete(filePath, '过时备份');
          cleanedBackups++;
        }
      }
      
      console.log(`✅ 清理过时备份: ${cleanedBackups} 个文件`);
    }
  }

  /**
   * 安全删除文件
   */
  async safeDelete(filePath, category) {
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        
        if (stats.isFile()) {
          fs.unlinkSync(filePath);
          this.cleanedFiles.push({
            path: path.relative(this.projectRoot, filePath),
            category: category,
            size: stats.size
          });
          console.log(`🗑️ 删除 ${category}: ${path.basename(filePath)}`);
        } else if (stats.isDirectory()) {
          // 递归删除目录
          this.deleteDirectory(filePath);
          this.cleanedFiles.push({
            path: path.relative(this.projectRoot, filePath),
            category: category,
            size: 0
          });
          console.log(`🗑️ 删除目录 ${category}: ${path.basename(filePath)}`);
        }
      }
    } catch (error) {
      this.errors.push({
        file: filePath,
        error: error.message
      });
      console.warn(`⚠️ 删除失败: ${path.basename(filePath)} - ${error.message}`);
    }
  }

  /**
   * 递归删除目录
   */
  deleteDirectory(dirPath) {
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        
        if (stats.isDirectory()) {
          this.deleteDirectory(filePath);
        } else {
          fs.unlinkSync(filePath);
        }
      }
      
      fs.rmdirSync(dirPath);
    }
  }

  /**
   * 生成清理报告
   */
  async generateCleanupReport() {
    console.log('\n📊 生成清理报告...');
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total_files_cleaned: this.cleanedFiles.length,
        total_size_freed: this.cleanedFiles.reduce((sum, file) => sum + file.size, 0),
        errors_count: this.errors.length
      },
      cleaned_files_by_category: this.groupFilesByCategory(),
      cleaned_files: this.cleanedFiles,
      errors: this.errors,
      remaining_structure: await this.getCleanProjectStructure()
    };
    
    const reportPath = path.join(this.projectRoot, 'backend/backups', `cleanup_report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    
    // 确保备份目录存在
    const backupDir = path.dirname(reportPath);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`✅ 清理报告已生成: ${path.basename(reportPath)}`);
    console.log('📊 清理摘要:');
    console.log(`   - 清理文件: ${report.summary.total_files_cleaned} 个`);
    console.log(`   - 释放空间: ${(report.summary.total_size_freed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   - 错误数量: ${report.summary.errors_count} 个`);
  }

  /**
   * 按类别分组文件
   */
  groupFilesByCategory() {
    const grouped = {};
    
    for (const file of this.cleanedFiles) {
      if (!grouped[file.category]) {
        grouped[file.category] = [];
      }
      grouped[file.category].push(file.path);
    }
    
    return grouped;
  }

  /**
   * 获取清理后的项目结构
   */
  async getCleanProjectStructure() {
    const structure = {
      root_files: [],
      backend_structure: {},
      frontend_structure: {}
    };
    
    // 根目录文件
    const rootFiles = fs.readdirSync(this.projectRoot)
      .filter(file => fs.statSync(path.join(this.projectRoot, file)).isFile());
    
    structure.root_files = rootFiles;
    
    return structure;
  }
}

// 主程序
async function main() {
  const cleaner = new DeprecatedFilesCleaner();
  
  try {
    await cleaner.clean();
    process.exit(0);
  } catch (error) {
    console.error('\n💥 清理失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = DeprecatedFilesCleaner;
