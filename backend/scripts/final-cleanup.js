#!/usr/bin/env node

/**
 * 🧹 最终清理脚本
 * 
 * 功能:
 * 1. 清理剩余的废弃文件
 * 2. 整理scripts目录
 * 3. 清理frontend临时文件
 * 4. 清理node_modules目录
 * 5. 生成最终项目结构
 */

const fs = require('fs');
const path = require('path');

class FinalCleaner {
  constructor() {
    this.projectRoot = path.join(__dirname, '../..');
    this.cleanedFiles = [];
    
    console.log('🧹 最终项目清理工具');
    console.log('=' .repeat(60));
  }

  /**
   * 主清理流程
   */
  async clean() {
    try {
      console.log(`📁 项目根目录: ${this.projectRoot}`);
      
      // 1. 清理scripts目录重复文件
      await this.cleanScriptsDirectory();
      
      // 2. 清理frontend临时文件
      await this.cleanFrontendTempFiles();
      
      // 3. 清理根目录node_modules
      await this.cleanRootNodeModules();
      
      // 4. 生成最终项目结构
      await this.generateFinalStructure();
      
      console.log('\n🎉 最终清理完成！');
      console.log(`📊 额外清理: ${this.cleanedFiles.length} 个文件/目录`);
      
    } catch (error) {
      console.error('\n❌ 清理失败:', error);
      throw error;
    }
  }

  /**
   * 清理scripts目录
   */
  async cleanScriptsDirectory() {
    console.log('\n📜 清理scripts目录...');
    
    const scriptsToKeep = [
      'start.sh',
      'start.bat', 
      'stop.sh',
      'stop.ps1',
      'simple-deploy.sh',
      'simple-stop.sh',
      'simple-uninstall.sh'
    ];
    
    const scriptsDir = path.join(this.projectRoot, 'scripts');
    
    if (fs.existsSync(scriptsDir)) {
      const files = fs.readdirSync(scriptsDir);
      
      for (const file of files) {
        if (!scriptsToKeep.includes(file) && file !== 'README.md') {
          const filePath = path.join(scriptsDir, file);
          await this.safeDelete(filePath, 'scripts目录废弃文件');
        }
      }
    }
    
    console.log('✅ scripts目录清理完成');
  }

  /**
   * 清理frontend临时文件
   */
  async cleanFrontendTempFiles() {
    console.log('\n🎨 清理frontend临时文件...');
    
    const frontendTempFiles = [
      'frontend/README_API_TESTING.md',
      'frontend/VITE_MIGRATION.md',
      'frontend/test-switch-ui.html',
      'frontend/index.html' // 重复文件，dist中已有
    ];
    
    for (const file of frontendTempFiles) {
      const filePath = path.join(this.projectRoot, file);
      await this.safeDelete(filePath, 'frontend临时文件');
    }
    
    console.log('✅ frontend临时文件清理完成');
  }

  /**
   * 清理根目录node_modules
   */
  async cleanRootNodeModules() {
    console.log('\n📦 清理根目录node_modules...');
    
    const rootNodeModules = path.join(this.projectRoot, 'node_modules');
    
    if (fs.existsSync(rootNodeModules)) {
      console.log('🗑️ 删除根目录node_modules...');
      await this.deleteDirectory(rootNodeModules);
      this.cleanedFiles.push({
        path: 'node_modules',
        category: '根目录废弃依赖'
      });
      console.log('✅ 根目录node_modules已删除');
    } else {
      console.log('✅ 根目录node_modules不存在，无需清理');
    }
  }

  /**
   * 生成最终项目结构
   */
  async generateFinalStructure() {
    console.log('\n📋 生成最终项目结构...');
    
    const structure = {
      timestamp: new Date().toISOString(),
      project_name: 'GOST 代理管理系统',
      version: '1.0.0',
      structure: {
        root_files: this.getDirectoryContents('.', false),
        backend: {
          main_files: this.getDirectoryContents('backend', false),
          subdirectories: {
            config: this.getDirectoryContents('backend/config', false),
            routes: this.getDirectoryContents('backend/routes', false),
            services: this.getDirectoryContents('backend/services', false),
            models: this.getDirectoryContents('backend/models', false),
            migrations: this.getDirectoryContents('backend/migrations', false),
            scripts: this.getDirectoryContents('backend/scripts', false),
            utils: this.getDirectoryContents('backend/utils', false),
            middleware: this.getDirectoryContents('backend/middleware', false)
          }
        },
        frontend: {
          main_files: this.getDirectoryContents('frontend', false),
          dist: this.getDirectoryContents('frontend/dist', false),
          src: {
            main_files: this.getDirectoryContents('frontend/src', false),
            components: this.getDirectoryContents('frontend/src/components', false),
            views: this.getDirectoryContents('frontend/src/views', false),
            utils: this.getDirectoryContents('frontend/src/utils', false)
          }
        },
        scripts: this.getDirectoryContents('scripts', false)
      },
      statistics: {
        total_backend_files: this.countFiles('backend'),
        total_frontend_files: this.countFiles('frontend'),
        total_scripts: this.countFiles('scripts'),
        database_size: this.getFileSize('backend/database/database.sqlite')
      }
    };
    
    const structurePath = path.join(this.projectRoot, 'PROJECT_STRUCTURE.json');
    fs.writeFileSync(structurePath, JSON.stringify(structure, null, 2));
    
    console.log(`✅ 项目结构已生成: PROJECT_STRUCTURE.json`);
    console.log('📊 项目统计:');
    console.log(`   - 后端文件: ${structure.statistics.total_backend_files} 个`);
    console.log(`   - 前端文件: ${structure.statistics.total_frontend_files} 个`);
    console.log(`   - 脚本文件: ${structure.statistics.total_scripts} 个`);
    console.log(`   - 数据库大小: ${structure.statistics.database_size}`);
  }

  /**
   * 获取目录内容
   */
  getDirectoryContents(dirPath, includeHidden = false) {
    const fullPath = path.join(this.projectRoot, dirPath);
    
    if (!fs.existsSync(fullPath)) {
      return [];
    }
    
    try {
      return fs.readdirSync(fullPath)
        .filter(file => includeHidden || !file.startsWith('.'))
        .filter(file => {
          const filePath = path.join(fullPath, file);
          return fs.statSync(filePath).isFile();
        });
    } catch (error) {
      return [];
    }
  }

  /**
   * 计算文件数量
   */
  countFiles(dirPath) {
    const fullPath = path.join(this.projectRoot, dirPath);
    
    if (!fs.existsSync(fullPath)) {
      return 0;
    }
    
    let count = 0;
    
    const countRecursive = (dir) => {
      try {
        const files = fs.readdirSync(dir);
        
        for (const file of files) {
          if (file === 'node_modules') continue; // 跳过node_modules
          
          const filePath = path.join(dir, file);
          const stats = fs.statSync(filePath);
          
          if (stats.isFile()) {
            count++;
          } else if (stats.isDirectory()) {
            countRecursive(filePath);
          }
        }
      } catch (error) {
        // 忽略权限错误
      }
    };
    
    countRecursive(fullPath);
    return count;
  }

  /**
   * 获取文件大小
   */
  getFileSize(filePath) {
    const fullPath = path.join(this.projectRoot, filePath);
    
    try {
      const stats = fs.statSync(fullPath);
      const bytes = stats.size;
      
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    } catch (error) {
      return '未知';
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
          console.log(`🗑️ 删除 ${category}: ${path.basename(filePath)}`);
        } else if (stats.isDirectory()) {
          await this.deleteDirectory(filePath);
          console.log(`🗑️ 删除目录 ${category}: ${path.basename(filePath)}`);
        }
        
        this.cleanedFiles.push({
          path: path.relative(this.projectRoot, filePath),
          category: category
        });
      }
    } catch (error) {
      console.warn(`⚠️ 删除失败: ${path.basename(filePath)} - ${error.message}`);
    }
  }

  /**
   * 递归删除目录
   */
  async deleteDirectory(dirPath) {
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        
        if (stats.isDirectory()) {
          await this.deleteDirectory(filePath);
        } else {
          fs.unlinkSync(filePath);
        }
      }
      
      fs.rmdirSync(dirPath);
    }
  }
}

// 主程序
async function main() {
  const cleaner = new FinalCleaner();
  
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

module.exports = FinalCleaner;
