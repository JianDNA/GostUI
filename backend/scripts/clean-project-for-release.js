#!/usr/bin/env node

/**
 * 🧹 GOST 代理管理系统 - 项目发布前清理脚本
 * 
 * 功能:
 * 1. 清理调试和测试文件
 * 2. 清理日志文件
 * 3. 清理临时文件
 * 4. 清理开发环境配置
 * 5. 整理项目结构
 * 6. 生成清理报告
 * 
 * 使用方法:
 * node scripts/clean-project-for-release.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ProjectCleaner {
  constructor() {
    this.projectRoot = path.join(__dirname, '../..');
    this.cleanedFiles = [];
    this.cleanedDirs = [];
    this.archivedFiles = [];
    
    console.log('🧹 GOST 代理管理系统 - 项目发布前清理');
    console.log('=' .repeat(60));
  }

  /**
   * 主清理流程
   */
  async clean() {
    try {
      console.log(`📁 项目根目录: ${this.projectRoot}`);
      
      // 1. 清理调试文件
      await this.cleanDebugFiles();
      
      // 2. 清理测试文件
      await this.cleanTestFiles();
      
      // 3. 清理日志文件
      await this.cleanLogFiles();
      
      // 4. 清理临时文件
      await this.cleanTempFiles();
      
      // 5. 清理开发配置
      await this.cleanDevConfigs();
      
      // 6. 整理脚本文件
      await this.organizeScripts();
      
      // 7. 清理 node_modules 缓存
      await this.cleanNodeModules();
      
      // 8. 生成清理报告
      await this.generateReport();
      
      console.log('\n🎉 项目清理完成！');
      
    } catch (error) {
      console.error('\n❌ 清理失败:', error);
      throw error;
    }
  }

  /**
   * 清理调试文件
   */
  async cleanDebugFiles() {
    console.log('\n🐛 清理调试文件...');
    
    const debugPatterns = [
      '**/*.log',
      '**/debug.txt',
      '**/test-*.js',
      '**/debug-*.js',
      '**/*-debug.*',
      '**/current_schema.sql',
      '**/users_schema.sql',
      '**/complete_schema.sql'
    ];
    
    await this.cleanByPatterns(debugPatterns, '调试文件');
  }

  /**
   * 清理测试文件
   */
  async cleanTestFiles() {
    console.log('\n🧪 清理测试文件...');
    
    const testPatterns = [
      '**/test-*.json',
      '**/test-*.txt',
      '**/sample-*.js',
      '**/example-*.js',
      '**/*.test.js',
      '**/*.spec.js'
    ];
    
    await this.cleanByPatterns(testPatterns, '测试文件');
  }

  /**
   * 清理日志文件
   */
  async cleanLogFiles() {
    console.log('\n📝 清理日志文件...');
    
    const logDirs = [
      path.join(this.projectRoot, 'logs'),
      path.join(this.projectRoot, 'backend/logs'),
      path.join(this.projectRoot, 'frontend/logs')
    ];
    
    for (const logDir of logDirs) {
      if (fs.existsSync(logDir)) {
        const files = fs.readdirSync(logDir);
        for (const file of files) {
          const filePath = path.join(logDir, file);
          if (fs.statSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
            this.cleanedFiles.push(filePath);
          }
        }
        console.log(`✅ 清理日志目录: ${logDir} (${files.length} 个文件)`);
      }
    }
  }

  /**
   * 清理临时文件
   */
  async cleanTempFiles() {
    console.log('\n🗑️ 清理临时文件...');
    
    const tempPatterns = [
      '**/.DS_Store',
      '**/Thumbs.db',
      '**/*.tmp',
      '**/*.temp',
      '**/*.bak',
      '**/*.swp',
      '**/*.swo',
      '**/~*',
      '**/.vscode/settings.json'
    ];
    
    await this.cleanByPatterns(tempPatterns, '临时文件');
  }

  /**
   * 清理开发配置
   */
  async cleanDevConfigs() {
    console.log('\n⚙️ 清理开发配置...');
    
    const devFiles = [
      path.join(this.projectRoot, '.env.development'),
      path.join(this.projectRoot, '.env.local'),
      path.join(this.projectRoot, 'backend/.env.development'),
      path.join(this.projectRoot, 'frontend/.env.development')
    ];
    
    for (const file of devFiles) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        this.cleanedFiles.push(file);
        console.log(`✅ 删除开发配置: ${path.basename(file)}`);
      }
    }
  }

  /**
   * 整理脚本文件
   */
  async organizeScripts() {
    console.log('\n📜 整理脚本文件...');
    
    const scriptsDir = path.join(this.projectRoot, 'backend/scripts');
    const archiveDir = path.join(scriptsDir, 'archived');
    
    // 创建归档目录
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }
    
    // 需要归档的脚本模式
    const archivePatterns = [
      'test-*.js',
      'debug-*.js',
      'sample-*.js',
      'old-*.js',
      'backup-*.js'
    ];
    
    if (fs.existsSync(scriptsDir)) {
      const files = fs.readdirSync(scriptsDir);
      
      for (const file of files) {
        const filePath = path.join(scriptsDir, file);
        
        if (fs.statSync(filePath).isFile()) {
          const shouldArchive = archivePatterns.some(pattern => {
            const regex = new RegExp(pattern.replace('*', '.*'));
            return regex.test(file);
          });
          
          if (shouldArchive) {
            const archivePath = path.join(archiveDir, file);
            fs.renameSync(filePath, archivePath);
            this.archivedFiles.push(file);
            console.log(`📦 归档脚本: ${file}`);
          }
        }
      }
    }
    
    console.log(`✅ 已归档 ${this.archivedFiles.length} 个脚本文件`);
  }

  /**
   * 清理 node_modules 缓存
   */
  async cleanNodeModules() {
    console.log('\n📦 清理 node_modules 缓存...');
    
    try {
      // 清理 npm 缓存
      execSync('npm cache clean --force', { stdio: 'pipe' });
      console.log('✅ npm 缓存已清理');
      
      // 清理 package-lock.json 中的完整性哈希
      const backendLockFile = path.join(this.projectRoot, 'backend/package-lock.json');
      const frontendLockFile = path.join(this.projectRoot, 'frontend/package-lock.json');
      
      for (const lockFile of [backendLockFile, frontendLockFile]) {
        if (fs.existsSync(lockFile)) {
          console.log(`✅ 保留 ${path.basename(lockFile)}`);
        }
      }
      
    } catch (error) {
      console.warn('⚠️ 清理 npm 缓存时出现警告:', error.message);
    }
  }

  /**
   * 按模式清理文件
   */
  async cleanByPatterns(patterns, description) {
    let totalCleaned = 0;

    for (const pattern of patterns) {
      try {
        // 简化的模式匹配，避免使用 glob 依赖
        const files = this.findFilesByPattern(this.projectRoot, pattern);

        for (const file of files) {
          if (fs.existsSync(file) && fs.statSync(file).isFile()) {
            fs.unlinkSync(file);
            this.cleanedFiles.push(file);
            totalCleaned++;
          }
        }
      } catch (error) {
        console.warn(`⚠️ 清理模式 ${pattern} 时出现警告:`, error.message);
      }
    }

    console.log(`✅ 清理${description}: ${totalCleaned} 个文件`);
  }

  /**
   * 简单的文件模式匹配
   */
  findFilesByPattern(dir, pattern, results = []) {
    try {
      const files = fs.readdirSync(dir);

      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          // 跳过 node_modules 和 .git 目录
          if (file !== 'node_modules' && file !== '.git' && !file.startsWith('.')) {
            this.findFilesByPattern(filePath, pattern, results);
          }
        } else {
          // 简单的模式匹配
          if (this.matchPattern(file, pattern)) {
            results.push(filePath);
          }
        }
      }
    } catch (error) {
      // 忽略权限错误等
    }

    return results;
  }

  /**
   * 简单的模式匹配函数
   */
  matchPattern(filename, pattern) {
    // 移除 **/ 前缀
    const cleanPattern = pattern.replace(/^\*\*\//, '');

    // 转换为正则表达式
    const regexPattern = cleanPattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filename);
  }

  /**
   * 生成清理报告
   */
  async generateReport() {
    console.log('\n📊 生成清理报告...');
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        cleaned_files: this.cleanedFiles.length,
        cleaned_directories: this.cleanedDirs.length,
        archived_files: this.archivedFiles.length
      },
      cleaned_files: this.cleanedFiles.map(f => path.relative(this.projectRoot, f)),
      archived_files: this.archivedFiles,
      project_structure: await this.getProjectStructure()
    };
    
    const reportPath = path.join(this.projectRoot, 'backend/scripts/clean-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`✅ 清理报告已生成: ${reportPath}`);
    console.log(`📊 清理统计:`);
    console.log(`   - 清理文件: ${report.summary.cleaned_files} 个`);
    console.log(`   - 归档文件: ${report.summary.archived_files} 个`);
  }

  /**
   * 获取项目结构
   */
  async getProjectStructure() {
    const structure = {};
    
    const mainDirs = ['backend', 'frontend', 'oldVersion'];
    
    for (const dir of mainDirs) {
      const dirPath = path.join(this.projectRoot, dir);
      if (fs.existsSync(dirPath)) {
        structure[dir] = this.getDirStructure(dirPath, 2); // 最多2层深度
      }
    }
    
    return structure;
  }

  /**
   * 获取目录结构
   */
  getDirStructure(dirPath, maxDepth, currentDepth = 0) {
    if (currentDepth >= maxDepth) return '...';
    
    const items = {};
    
    try {
      const files = fs.readdirSync(dirPath);
      
      for (const file of files) {
        if (file.startsWith('.')) continue; // 跳过隐藏文件
        
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          items[file + '/'] = this.getDirStructure(filePath, maxDepth, currentDepth + 1);
        } else {
          items[file] = stat.size;
        }
      }
    } catch (error) {
      return 'Error reading directory';
    }
    
    return items;
  }
}

// 主程序
async function main() {
  const cleaner = new ProjectCleaner();
  
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

module.exports = ProjectCleaner;
