#!/usr/bin/env node

/**
 * 🚀 GOST 代理管理系统 - 发布准备脚本
 * 
 * 功能:
 * 1. 项目清理
 * 2. 数据库初始化
 * 3. 依赖检查
 * 4. 构建验证
 * 5. 生成发布包
 * 
 * 使用方法:
 * node scripts/prepare-for-release.js [--skip-clean] [--skip-db-init]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ProjectCleaner = require('./clean-project-for-release');
const DatabaseInitializer = require('./init-production-database');

class ReleasePreparator {
  constructor() {
    this.projectRoot = path.join(__dirname, '../..');
    this.options = this.parseArguments();
    
    console.log('🚀 GOST 代理管理系统 - 发布准备');
    console.log('=' .repeat(60));
  }

  /**
   * 解析命令行参数
   */
  parseArguments() {
    const args = process.argv.slice(2);
    return {
      skipClean: args.includes('--skip-clean'),
      skipDbInit: args.includes('--skip-db-init'),
      verbose: args.includes('--verbose')
    };
  }

  /**
   * 主准备流程
   */
  async prepare() {
    try {
      console.log('📋 发布准备选项:');
      console.log(`   - 跳过清理: ${this.options.skipClean ? '是' : '否'}`);
      console.log(`   - 跳过数据库初始化: ${this.options.skipDbInit ? '是' : '否'}`);
      
      // 1. 项目清理
      if (!this.options.skipClean) {
        await this.cleanProject();
      }
      
      // 2. 数据库初始化
      if (!this.options.skipDbInit) {
        await this.initializeDatabase();
      }
      
      // 3. 依赖检查
      await this.checkDependencies();
      
      // 4. 构建验证
      await this.verifyBuild();
      
      // 5. 生成发布信息
      await this.generateReleaseInfo();
      
      // 6. 创建发布包
      await this.createReleasePackage();
      
      console.log('\n🎉 发布准备完成！');
      console.log('📦 发布包已生成，可以进行部署');
      
    } catch (error) {
      console.error('\n❌ 发布准备失败:', error);
      throw error;
    }
  }

  /**
   * 项目清理
   */
  async cleanProject() {
    console.log('\n🧹 执行项目清理...');
    
    const cleaner = new ProjectCleaner();
    await cleaner.clean();
    
    console.log('✅ 项目清理完成');
  }

  /**
   * 数据库初始化
   */
  async initializeDatabase() {
    console.log('\n💾 执行数据库初始化...');
    
    // 确认操作
    console.log('⚠️ 此操作将清空现有数据库并重新初始化');
    console.log('   默认管理员账户: admin / admin123');
    
    const initializer = new DatabaseInitializer();
    await initializer.initialize();
    
    console.log('✅ 数据库初始化完成');
  }

  /**
   * 检查依赖
   */
  async checkDependencies() {
    console.log('\n📦 检查项目依赖...');
    
    // 检查后端依赖
    await this.checkBackendDependencies();
    
    // 检查前端依赖
    await this.checkFrontendDependencies();
    
    console.log('✅ 依赖检查完成');
  }

  /**
   * 检查后端依赖
   */
  async checkBackendDependencies() {
    console.log('🔍 检查后端依赖...');
    
    const backendDir = path.join(this.projectRoot, 'backend');
    const packageJsonPath = path.join(backendDir, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error('后端 package.json 不存在');
    }
    
    try {
      execSync('npm audit --audit-level=high', { 
        cwd: backendDir, 
        stdio: this.options.verbose ? 'inherit' : 'pipe' 
      });
      console.log('✅ 后端依赖安全检查通过');
    } catch (error) {
      console.warn('⚠️ 后端依赖存在安全警告，请检查');
    }
    
    // 检查关键依赖
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const criticalDeps = ['express', 'sequelize', 'sqlite3', 'bcryptjs'];
    
    for (const dep of criticalDeps) {
      if (!packageJson.dependencies[dep]) {
        throw new Error(`关键依赖缺失: ${dep}`);
      }
    }
    
    console.log('✅ 后端关键依赖检查通过');
  }

  /**
   * 检查前端依赖
   */
  async checkFrontendDependencies() {
    console.log('🔍 检查前端依赖...');
    
    const frontendDir = path.join(this.projectRoot, 'frontend');
    const packageJsonPath = path.join(frontendDir, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error('前端 package.json 不存在');
    }
    
    try {
      execSync('npm audit --audit-level=high', { 
        cwd: frontendDir, 
        stdio: this.options.verbose ? 'inherit' : 'pipe' 
      });
      console.log('✅ 前端依赖安全检查通过');
    } catch (error) {
      console.warn('⚠️ 前端依赖存在安全警告，请检查');
    }
    
    console.log('✅ 前端依赖检查完成');
  }

  /**
   * 验证构建
   */
  async verifyBuild() {
    console.log('\n🏗️ 验证项目构建...');
    
    // 验证前端构建
    await this.verifyFrontendBuild();
    
    // 验证后端启动
    await this.verifyBackendStart();
    
    console.log('✅ 构建验证完成');
  }

  /**
   * 验证前端构建
   */
  async verifyFrontendBuild() {
    console.log('🔍 验证前端构建...');
    
    const frontendDir = path.join(this.projectRoot, 'frontend');
    
    try {
      execSync('npm run build', { 
        cwd: frontendDir, 
        stdio: this.options.verbose ? 'inherit' : 'pipe' 
      });
      
      const distDir = path.join(frontendDir, 'dist');
      if (!fs.existsSync(distDir)) {
        throw new Error('前端构建产物不存在');
      }
      
      console.log('✅ 前端构建验证通过');
    } catch (error) {
      throw new Error(`前端构建失败: ${error.message}`);
    }
  }

  /**
   * 验证后端启动
   */
  async verifyBackendStart() {
    console.log('🔍 验证后端启动...');
    
    const backendDir = path.join(this.projectRoot, 'backend');
    
    // 这里只做语法检查，不实际启动服务
    try {
      execSync('node -c app.js', { 
        cwd: backendDir, 
        stdio: 'pipe' 
      });
      console.log('✅ 后端语法检查通过');
    } catch (error) {
      throw new Error(`后端语法错误: ${error.message}`);
    }
  }

  /**
   * 生成发布信息
   */
  async generateReleaseInfo() {
    console.log('\n📋 生成发布信息...');
    
    const releaseInfo = {
      version: '1.0.0',
      build_time: new Date().toISOString(),
      git_commit: await this.getGitCommit(),
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
      features: [
        'GOST 代理管理',
        '用户认证和授权',
        '流量统计和限制',
        '自动配置同步',
        '性能模式管理',
        'Web 管理界面'
      ],
      default_credentials: {
        username: 'admin',
        password: 'admin123'
      },
      database: {
        type: 'SQLite',
        initialized: true,
        default_admin_created: true
      }
    };
    
    const releaseInfoPath = path.join(this.projectRoot, 'RELEASE_INFO.json');
    fs.writeFileSync(releaseInfoPath, JSON.stringify(releaseInfo, null, 2));
    
    console.log(`✅ 发布信息已生成: ${releaseInfoPath}`);
  }

  /**
   * 获取 Git 提交信息
   */
  async getGitCommit() {
    try {
      const commit = execSync('git rev-parse HEAD', { 
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();
      return commit;
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * 创建发布包
   */
  async createReleasePackage() {
    console.log('\n📦 创建发布包...');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const packageName = `gost-proxy-manager-v1.0.0-${timestamp}`;
    const packageDir = path.join(this.projectRoot, '..', packageName);
    
    // 创建发布包目录
    if (fs.existsSync(packageDir)) {
      fs.rmSync(packageDir, { recursive: true });
    }
    fs.mkdirSync(packageDir, { recursive: true });
    
    // 复制必要文件
    const filesToCopy = [
      'backend',
      'frontend/dist',
      'README.md',
      'RELEASE_INFO.json'
    ];
    
    for (const file of filesToCopy) {
      const srcPath = path.join(this.projectRoot, file);
      const destPath = path.join(packageDir, file);
      
      if (fs.existsSync(srcPath)) {
        this.copyRecursive(srcPath, destPath);
        console.log(`✅ 复制: ${file}`);
      }
    }
    
    // 创建启动脚本
    const startScript = `#!/bin/bash
echo "🚀 启动 GOST 代理管理系统"
echo "默认管理员账户: admin / admin123"
echo "访问地址: http://localhost:3000"
echo ""
cd backend
npm install --production
node app.js
`;
    
    fs.writeFileSync(path.join(packageDir, 'start.sh'), startScript);
    fs.chmodSync(path.join(packageDir, 'start.sh'), '755');
    
    console.log(`✅ 发布包已创建: ${packageDir}`);
    console.log('📋 发布包内容:');
    console.log('   - backend/          后端代码');
    console.log('   - frontend/dist/    前端构建产物');
    console.log('   - start.sh          启动脚本');
    console.log('   - RELEASE_INFO.json 发布信息');
  }

  /**
   * 递归复制文件
   */
  copyRecursive(src, dest) {
    const stat = fs.statSync(src);
    
    if (stat.isDirectory()) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      
      const files = fs.readdirSync(src);
      for (const file of files) {
        // 跳过不需要的文件
        if (file === 'node_modules' || file === '.git' || file.startsWith('.')) {
          continue;
        }
        
        this.copyRecursive(
          path.join(src, file),
          path.join(dest, file)
        );
      }
    } else {
      fs.copyFileSync(src, dest);
    }
  }
}

// 主程序
async function main() {
  const preparator = new ReleasePreparator();
  
  try {
    await preparator.prepare();
    process.exit(0);
  } catch (error) {
    console.error('\n💥 发布准备失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = ReleasePreparator;
